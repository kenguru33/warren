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
import { getDb } from '../db'

export const CAST_FAKE = process.env.WARREN_CAST_FAKE === '1'

/** Targets not seen by this many sweeps are marked unreachable, not deleted. */
export const STALE_AFTER_MS = 180_000

export interface DiscoveredTarget {
  targetId: string
  friendlyName: string
  address: string
  port: number
  model: string | null
}

const FAKE_TARGETS: DiscoveredTarget[] = [
  { targetId: 'fake-kitchen', friendlyName: 'Kitchen speaker', address: '127.0.0.1', port: 8009, model: 'Google Home' },
  { targetId: 'fake-office',  friendlyName: 'Office display',  address: '127.0.0.1', port: 8009, model: 'Nest Hub' },
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
  }
}

export function upsertDiscovered(target: DiscoveredTarget) {
  getDb().prepare(`
    INSERT INTO music_targets (target_id, friendly_name, address, port, model, origin, last_seen)
    VALUES (?, ?, ?, ?, ?, 'discovered', ?)
    ON CONFLICT(target_id) DO UPDATE SET
      friendly_name = excluded.friendly_name,
      address       = excluded.address,
      port          = excluded.port,
      model         = excluded.model,
      last_seen     = excluded.last_seen
  `).run(
    target.targetId, target.friendlyName, target.address,
    target.port, target.model, Date.now(),
  )
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

export interface TargetRow {
  target_id: string
  friendly_name: string
  address: string
  port: number
  model: string | null
  origin: 'discovered' | 'manual'
  last_seen: number
}

export function listTargets(): TargetRow[] {
  return getDb().prepare(`
    SELECT target_id, friendly_name, address, port, model, origin, last_seen
    FROM music_targets ORDER BY friendly_name COLLATE NOCASE ASC
  `).all() as TargetRow[]
}

export function getTarget(targetId: string): TargetRow | null {
  return getDb().prepare(`
    SELECT target_id, friendly_name, address, port, model, origin, last_seen
    FROM music_targets WHERE target_id = ?
  `).get(targetId) as TargetRow | undefined ?? null
}

/** Manual entries are reachable by assumption — we never saw them via mDNS. */
export function isReachable(row: TargetRow): boolean {
  if (row.origin === 'manual') return true
  return Date.now() - row.last_seen < STALE_AFTER_MS
}
