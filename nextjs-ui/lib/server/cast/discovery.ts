// mDNS discovery of Google Cast devices.
//
// Browses `_googlecast._tcp` and upserts what it finds into `music_targets`.
// Discovered rows are a cache and may be pruned; manually added rows are user
// configuration and are never touched here.
//
// mDNS needs link-local network access, which Docker's default bridge network
// does not provide. Warren's standard `./docker/warren start` runs the UI as a
// host process so this works out of the box; containerized deployments need
// host networking or an mDNS reflector. The manual add-by-IP path in
// `POST /api/music/targets` exists for when neither is available.

import { Bonjour, type Browser, type Service } from 'bonjour-service'
import { upsertDiscovered, type DiscoveredTarget } from '../targets'

export const CAST_FAKE = process.env.WARREN_CAST_FAKE === '1'

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
  }

  stop() {
    try { this.browser?.stop() } catch { /* already stopped */ }
    try { this.bonjour?.destroy() } catch { /* already destroyed */ }
    this.browser = null
    this.bonjour = null
  }
}

