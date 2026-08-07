// SSDP discovery of Sonos speakers.
//
// Sonos is not Cast in miniature: it announces over SSDP rather than mDNS
// `_googlecast._tcp`, and is controlled with UPnP SOAP on port 1400 rather than
// CASTV2 over TLS on 8009. Nothing in ../cast/ applies. What is shared is the
// `music_targets` row — the player picks an output, and the protocol behind it
// is an implementation detail.
//
// Only group *coordinators* become targets. Sonos speakers bound into a group
// all play the same thing, so listing a bound member as its own output would
// let a user pick "Kitchen" and fill four rooms with sound. The coordinator
// carries the names of the rooms it brings with it so the UI can say so.
//
// Like mDNS, SSDP needs link-local access that Docker's default bridge network
// does not provide; the manual add-by-IP path exists for when it is unavailable.

import { SonosManager, SonosDevice } from '@svrooij/sonos'
import { upsertDiscovered, pruneDiscovered, type DiscoveredTarget } from '../targets'

export const SONOS_FAKE = process.env.WARREN_SONOS_FAKE === '1'

export const SONOS_PORT = 1400

/** Sonos target ids are namespaced so they cannot collide with Cast UUIDs. */
export function sonosTargetId(uuid: string): string {
  return `sonos:${uuid}`
}

const FAKE_TARGETS: DiscoveredTarget[] = [
  {
    targetId: sonosTargetId('RINCON_FAKEKITCHEN'),
    friendlyName: 'Kitchen',
    address: '127.0.0.1',
    port: SONOS_PORT,
    model: 'Sonos One',
    protocol: 'sonos',
    groupRooms: null,
    householdId: 'Sonos_fakehousehold',
  },
  {
    // Deliberately grouped, so the group path is exercised without hardware.
    targetId: sonosTargetId('RINCON_FAKELIVING'),
    friendlyName: 'Living Room',
    address: '127.0.0.1',
    port: SONOS_PORT,
    model: 'Sonos Five',
    protocol: 'sonos',
    groupRooms: ['Dining Room'],
    householdId: 'Sonos_fakehousehold',
  },
]

export function fakeTargets(): DiscoveredTarget[] {
  return FAKE_TARGETS
}

/**
 * Turn one manager-known device into a target, or null when it is a group
 * member rather than a coordinator.
 */
function toTarget(device: SonosDevice): DiscoveredTarget | null {
  const coordinator = device.Coordinator
  // A device whose coordinator is another device is bound into that group and
  // is not independently addressable.
  if (coordinator && coordinator.Uuid !== device.Uuid) return null

  const uuid = device.Uuid
  const host = device.Host
  if (!uuid || !host) return null

  // GroupName reads like "Living Room + 2" or "Kitchen"; the member names come
  // from the manager's device list rather than parsing that string.
  const members = (device.GroupName ?? '').includes('+')
    ? groupMemberNames(device)
    : []

  return {
    targetId: sonosTargetId(uuid),
    friendlyName: device.Name ?? 'Sonos speaker',
    address: host,
    port: device.Port ?? SONOS_PORT,
    model: null,
    protocol: 'sonos',
    groupRooms: members.length ? members : null,
    householdId: null,
  }
}

function groupMemberNames(coordinator: SonosDevice): string[] {
  const managed = state().manager?.Devices ?? []
  return managed
    .filter(d => d.Uuid !== coordinator.Uuid && d.Coordinator?.Uuid === coordinator.Uuid)
    .map(d => d.Name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
    .sort()
}

interface DiscoveryState {
  manager: SonosManager | null
  initializing: Promise<void> | null
}

declare global {
  var __warren_sonos_discovery: DiscoveryState | undefined
}

function state(): DiscoveryState {
  if (!globalThis.__warren_sonos_discovery) {
    globalThis.__warren_sonos_discovery = { manager: null, initializing: null }
  }
  return globalThis.__warren_sonos_discovery
}

export function getManager(): SonosManager | null {
  return state().manager
}

/**
 * Find the managed device for a target, so control calls do not have to
 * re-discover. Falls back to constructing one from the stored address, which is
 * what makes manually added speakers work.
 */
export function deviceFor(targetId: string, address: string, port: number): SonosDevice {
  const uuid = targetId.startsWith('sonos:') ? targetId.slice('sonos:'.length) : targetId
  const known = state().manager?.Devices.find(d => d.Uuid === uuid)
  return known ?? new SonosDevice(address, port)
}

/**
 * Owns the SSDP discovery manager. Must be stopped on shutdown and on dev HMR:
 * a leaked manager keeps UDP sockets and event subscriptions alive per reload,
 * and Sonos speakers hold renewing subscriptions open.
 */
export class SonosDiscovery {
  async start(): Promise<void> {
    if (SONOS_FAKE) {
      sweepFake()
      return
    }

    const s = state()
    if (s.manager || s.initializing) return

    s.initializing = (async () => {
      const manager = new SonosManager()
      // Discovery answers trickle in over multicast; a short window is enough
      // on a quiet LAN and keeps boot from stalling when there is no Sonos.
      const found = await manager.InitializeWithDiscovery(5)
      if (!found) {
        // No Sonos on this network is a normal outcome, not an error.
        s.manager = null
        return
      }
      s.manager = manager
      writeTargets(manager)
    })()

    try {
      await s.initializing
    } catch (err) {
      console.error('[sonos] SSDP discovery unavailable:', err)
      state().manager = null
    } finally {
      state().initializing = null
    }
  }

  /** Re-read group topology and refresh the target rows. */
  async sweep(): Promise<void> {
    if (SONOS_FAKE) {
      sweepFake()
      return
    }

    const s = state()
    if (!s.manager) {
      // A speaker may have been powered on since boot found nothing.
      await this.start()
      return
    }

    try {
      // The manager keeps its device list current through group-event
      // subscriptions, so a sweep renews those subscriptions and re-reads what
      // it already knows rather than re-running discovery. Same principle as
      // the cast runtime: push is the mechanism, the poll is the backstop.
      await s.manager.CheckAllEventSubscriptions()
      writeTargets(s.manager)
    } catch (err) {
      // Leave the previously known targets in place — an empty picker is worse
      // than a slightly stale one.
      console.error('[sonos] SSDP sweep failed:', err)
    }
  }

  async stop(): Promise<void> {
    const s = state()
    const manager = s.manager
    s.manager = null
    s.initializing = null
    if (!manager) return
    try {
      await manager.CancelSubscription()
    } catch { /* already gone */ }
  }
}

function writeTargets(manager: SonosManager) {
  const seen: string[] = []
  for (const device of manager.Devices) {
    const target = toTarget(device)
    if (!target) continue
    upsertDiscovered(target)
    seen.push(target.targetId)
  }
  // A speaker that became a group member is no longer a valid output; leaving
  // its row would offer a target that plays in rooms the label does not name.
  pruneDiscovered('sonos', seen)
}

function sweepFake() {
  for (const target of FAKE_TARGETS) upsertDiscovered(target)
  pruneDiscovered('sonos', FAKE_TARGETS.map(t => t.targetId))
}
