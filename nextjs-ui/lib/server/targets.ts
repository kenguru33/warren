// Protocol-neutral access to `music_targets`.
//
// Cast and Sonos both discover devices and both write rows here, so these
// queries live above either stack. Putting them in `cast/discovery.ts` — where
// they started, when Cast was the only protocol — would make the Sonos code
// import from the Cast stack for something that has nothing to do with Cast.

import { getDb } from './db'

/** Targets not seen for this long are marked unreachable, not deleted. */
export const STALE_AFTER_MS = 180_000

export type TargetProtocol = 'cast' | 'sonos'

export interface TargetRow {
  target_id: string
  friendly_name: string
  address: string
  port: number
  model: string | null
  origin: 'discovered' | 'manual'
  protocol: TargetProtocol
  /** Sonos only: JSON array of the other rooms a group coordinator carries. */
  group_rooms: string | null
  household_id: string | null
  last_seen: number
}

const COLUMNS =
  'target_id, friendly_name, address, port, model, origin, protocol, group_rooms, household_id, last_seen'

export function listTargets(): TargetRow[] {
  return getDb().prepare(`
    SELECT ${COLUMNS} FROM music_targets ORDER BY friendly_name COLLATE NOCASE ASC
  `).all() as TargetRow[]
}

export function getTarget(targetId: string): TargetRow | null {
  return getDb().prepare(`SELECT ${COLUMNS} FROM music_targets WHERE target_id = ?`)
    .get(targetId) as TargetRow | undefined ?? null
}

export interface DiscoveredTarget {
  targetId: string
  friendlyName: string
  address: string
  port: number
  model: string | null
  protocol: TargetProtocol
  groupRooms?: string[] | null
  householdId?: string | null
}

export function upsertDiscovered(target: DiscoveredTarget) {
  getDb().prepare(`
    INSERT INTO music_targets
      (target_id, friendly_name, address, port, model, origin, protocol, group_rooms, household_id, last_seen)
    VALUES (?, ?, ?, ?, ?, 'discovered', ?, ?, ?, ?)
    ON CONFLICT(target_id) DO UPDATE SET
      friendly_name = excluded.friendly_name,
      address       = excluded.address,
      port          = excluded.port,
      model         = excluded.model,
      protocol      = excluded.protocol,
      group_rooms   = excluded.group_rooms,
      household_id  = excluded.household_id,
      last_seen     = excluded.last_seen
  `).run(
    target.targetId, target.friendlyName, target.address, target.port, target.model,
    target.protocol,
    target.groupRooms?.length ? JSON.stringify(target.groupRooms) : null,
    target.householdId ?? null,
    Date.now(),
  )
}

/**
 * Drop discovered rows of one protocol that this sweep did not see.
 *
 * Sonos needs this and Cast does not: when speakers are grouped, a former
 * coordinator stops being a target entirely rather than merely going quiet, and
 * leaving the stale row would offer an output that plays in the wrong rooms.
 * Manual rows are user configuration and are never touched.
 */
export function pruneDiscovered(protocol: TargetProtocol, seenIds: string[]) {
  const db = getDb()
  const placeholders = seenIds.map(() => '?').join(',')
  const sql = seenIds.length
    ? `DELETE FROM music_targets WHERE protocol = ? AND origin = 'discovered' AND target_id NOT IN (${placeholders})`
    : "DELETE FROM music_targets WHERE protocol = ? AND origin = 'discovered'"
  db.prepare(sql).run(protocol, ...seenIds)
}

/** Manual entries are reachable by assumption — we never saw them announced. */
export function isReachable(row: TargetRow): boolean {
  if (row.origin === 'manual') return true
  return Date.now() - row.last_seen < STALE_AFTER_MS
}

export function groupRoomsOf(row: TargetRow): string[] {
  if (!row.group_rooms) return []
  try {
    const parsed = JSON.parse(row.group_rooms)
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : []
  } catch {
    return []
  }
}
