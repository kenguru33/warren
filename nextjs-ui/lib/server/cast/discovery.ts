// mDNS discovery of Google Cast devices.
//
// Browses `_googlecast._tcp` and upserts what it finds into `music_targets`.
// Discovered rows are a cache and may be pruned; manually added rows are user
// configuration and are never touched here.
//
// mDNS is multicast, and multicast does not cross Docker's default bridge
// network — which is where `./docker/warren start` runs the UI. When the mDNS
// browse comes up empty this falls back to probing the local subnet by unicast
// for port 8008, the unencrypted setup endpoint every Cast device serves. That
// crosses the bridge, so a containerized deployment still finds its speakers.
//
// The manual add-by-IP path in `POST /api/music/targets` remains for networks
// where even that is not possible (a routed VLAN, a different subnet).

import { Bonjour, type Browser, type Service } from 'bonjour-service'
import { upsertDiscovered, listTargets, isReachable, type DiscoveredTarget } from '../targets'

export const CAST_FAKE = process.env.WARREN_CAST_FAKE === '1'

/** Unencrypted setup endpoint; CASTV2 control is 8009. */
const CAST_SETUP_PORT = 8008
export const CAST_CONTROL_PORT = 8009

const SCAN_CONCURRENCY = 48
const SCAN_TIMEOUT_MS = 1200
/**
 * Don't re-scan on every sweep. A house with no Cast device would otherwise
 * fire 254 probes a minute forever; one that appears later is still found,
 * within ten minutes rather than one.
 */
const SCAN_MIN_INTERVAL_MS = 600_000

let lastScanAt = 0

// Target storage and reachability live in lib/server/targets.ts — they are
// shared with Sonos and are not Cast concerns. Re-exported here so the many
// existing `from './cast/discovery'` imports keep working.
export {
  listTargets, getTarget, isReachable, upsertDiscovered,
  STALE_AFTER_MS, type TargetRow, type DiscoveredTarget,
} from '../targets'

const FAKE_TARGETS: DiscoveredTarget[] = [
  { targetId: 'fake-kitchen', friendlyName: 'Kitchen speaker', address: '127.0.0.1', port: 8009, model: 'Google Home', protocol: 'cast' },
  { targetId: 'fake-office',  friendlyName: 'Office display',  address: '127.0.0.1', port: 8009, model: 'Nest Hub', protocol: 'cast' },
]

function textValue(txt: Service['txt'], key: string): string | null {
  if (!txt || typeof txt !== 'object') return null
  const value = (txt as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function toTarget(service: Service): DiscoveredTarget | null {
  // `id` is the device's stable UUID; `fn` its friendly name. Without an id we
  // have nothing to key on across sweeps, so skip the service.
  const id = textValue(service.txt, 'id')
  const address = service.addresses?.find(a => a.includes('.')) ?? service.addresses?.[0]
  if (!id || !address) return null

  return {
    targetId: id,
    friendlyName: textValue(service.txt, 'fn') ?? service.name ?? 'Cast device',
    address,
    port: service.port ?? 8009,
    model: textValue(service.txt, 'md'),
    protocol: 'cast',
  }
}


/**
 * Owns the mDNS browser. Must be stopped on shutdown and on dev HMR — a leaked
 * browser keeps a UDP socket and a timer alive per reload.
 */
export class CastDiscovery {
  private bonjour: Bonjour | null = null
  private browser: Browser | null = null

  start() {
    if (CAST_FAKE) {
      for (const target of FAKE_TARGETS) upsertDiscovered(target)
      return
    }
    if (this.browser) return

    try {
      this.bonjour = new Bonjour()
      this.browser = this.bonjour.find({ type: 'googlecast', protocol: 'tcp' })
      this.browser.on('up', (service: Service) => {
        const target = toTarget(service)
        if (target) upsertDiscovered(target)
      })
    } catch (err) {
      console.error('[cast] mDNS discovery unavailable:', err)
      this.stop()
    }

    // mDNS answers arrive asynchronously, so give them a moment before deciding
    // it found nothing and falling back to the unicast scan.
    setTimeout(() => {
      void scanIfMdnsFoundNothing().catch(err => console.error('[cast] scan failed:', err))
    }, 5_000)
  }

  /** Re-issue the query; `up` handlers fire again for everything that answers. */
  sweep() {
    if (CAST_FAKE) {
      for (const target of FAKE_TARGETS) upsertDiscovered(target)
      return
    }
    try {
      this.browser?.update()
    } catch (err) {
      console.error('[cast] mDNS sweep failed:', err)
    }
    void scanIfMdnsFoundNothing().catch(err => console.error('[cast] scan failed:', err))
  }

  stop() {
    try { this.browser?.stop() } catch { /* already stopped */ }
    try { this.bonjour?.destroy() } catch { /* already destroyed */ }
    this.browser = null
    this.bonjour = null
  }
}


/**
 * Probe the local subnet for Cast devices by unicast.
 *
 * Every Cast device serves `/setup/eureka_info` unencrypted on 8008, which
 * carries the friendly name and the device UUID. Unlike the Sonos fallback,
 * this must find *all* devices rather than one: a Cast device knows nothing
 * about its peers, so there is no topology to expand from a single answer.
 *
 * The subnet comes from WARREN_LAN_IP. Without it there is nothing to scan, and
 * guessing from the container's own address would scan Docker's private range.
 */
async function scanForCast(): Promise<DiscoveredTarget[]> {
  const lanIp = process.env.WARREN_LAN_IP?.trim()
  if (!lanIp || !/^(\d{1,3}\.){3}\d{1,3}$/.test(lanIp)) return []

  const prefix = lanIp.split('.').slice(0, 3).join('.')
  const hosts = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`)

  const found: DiscoveredTarget[] = []
  for (let i = 0; i < hosts.length; i += SCAN_CONCURRENCY) {
    const batch = hosts.slice(i, i + SCAN_CONCURRENCY)
    const results = await Promise.all(batch.map(probeCast))
    for (const target of results) if (target) found.push(target)
  }
  return found
}

async function probeCast(address: string): Promise<DiscoveredTarget | null> {
  try {
    const res = await fetch(`http://${address}:${CAST_SETUP_PORT}/setup/eureka_info`, {
      signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
    })
    if (!res.ok) return null

    const info = await res.json() as { name?: string; ssdp_udn?: string; model_name?: string }
    const udn = typeof info.ssdp_udn === 'string' ? info.ssdp_udn : null
    if (!udn) return null

    return {
      // mDNS advertises this UUID in its `id` TXT record with the dashes
      // stripped. Matching that exactly is what keeps a device discovered both
      // ways from becoming two rows.
      targetId: udn.replace(/-/g, ''),
      friendlyName: typeof info.name === 'string' && info.name ? info.name : address,
      address,
      port: CAST_CONTROL_PORT,
      model: typeof info.model_name === 'string' ? info.model_name : null,
      protocol: 'cast',
    }
  } catch {
    return null
  }
}

/**
 * Run the unicast fallback when mDNS has produced nothing reachable. Kept
 * fire-and-forget so a slow scan never blocks boot or a sweep.
 */
async function scanIfMdnsFoundNothing(): Promise<void> {
  if (CAST_FAKE) return

  const haveCast = listTargets()
    .some(t => t.protocol === 'cast' && t.origin === 'discovered' && isReachable(t))
  if (haveCast) return

  if (Date.now() - lastScanAt < SCAN_MIN_INTERVAL_MS) return
  lastScanAt = Date.now()

  const found = await scanForCast()
  if (!found.length) return
  console.log(`[cast] mDNS found nothing; ${found.length} device(s) from subnet scan`)
  for (const target of found) upsertDiscovered(target)
}
