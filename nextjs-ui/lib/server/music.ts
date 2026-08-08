// Server-side music data access. Everything that reads or writes the
// music_config / music_sources / music_volume tables lives here so route
// handlers stay thin, mirroring lib/server/light-groups.ts.
//
// Music is a single global component: one source library, one selected output,
// one playback state for the whole house. Nothing here is keyed by room.

import type Database from 'better-sqlite3'
import type {
  MusicSourceView, MusicTargetView, MusicView, MusicSourceKind,
} from '@/lib/shared/types'
import { MAX_MUSIC_SOURCES, BROWSER_TARGET_ID } from '@/lib/shared/types'
import { getDb } from './db'
import { HttpError } from './errors'
import { castRuntime } from './cast/runtime'
import { sonosRuntime } from './sonos/runtime'
import { listTargets, isReachable, groupRoomsOf, getTarget, type TargetRow } from './targets'

interface SourceRow {
  id: number
  name: string
  kind: MusicSourceKind
  content_id: string
  position: number
  is_default: number
  unavailable: number
  browser_only: number
}

const SOURCE_COLUMNS =
  'id, name, kind, content_id, position, is_default, unavailable, browser_only'

function toSourceView(row: SourceRow): MusicSourceView {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    contentId: row.content_id,
    position: row.position,
    isDefault: row.is_default === 1,
    unavailable: row.unavailable === 1,
    browserOnly: row.browser_only === 1,
  }
}

export function toTargetView(row: TargetRow): MusicTargetView {
  return {
    targetId: row.target_id,
    friendlyName: row.friendly_name,
    model: row.model,
    origin: row.origin,
    protocol: row.protocol,
    groupRooms: groupRoomsOf(row),
    reachable: isReachable(row),
    lastSeen: row.last_seen,
  }
}

export function listTargetViews(): MusicTargetView[] {
  return listTargets().map(toTargetView)
}

export function listSources(db: Database.Database): MusicSourceView[] {
  const rows = db.prepare(`
    SELECT ${SOURCE_COLUMNS} FROM music_sources ORDER BY position ASC, id ASC
  `).all() as SourceRow[]
  return rows.map(toSourceView)
}

export function getSource(db: Database.Database, sourceId: number): MusicSourceView | null {
  const row = db.prepare(`SELECT ${SOURCE_COLUMNS} FROM music_sources WHERE id = ?`)
    .get(sourceId) as SourceRow | undefined
  return row ? toSourceView(row) : null
}

/** The player is shown once music has been configured, not before. */
export function isConfigured(db: Database.Database): boolean {
  return !!db.prepare('SELECT id FROM music_config WHERE id = 1').get()
}

export function enableMusic(db: Database.Database, preferredTargetId: string | null) {
  db.prepare(`
    INSERT INTO music_config (id, preferred_target_id, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      preferred_target_id = excluded.preferred_target_id,
      updated_at = excluded.updated_at
  `).run(preferredTargetId, Date.now())
}

/** Removing music stops playback and drops the whole library. */
export function disableMusic(db: Database.Database) {
  castRuntime.release()
  db.transaction(() => {
    db.prepare('DELETE FROM music_sources').run()
    db.prepare('DELETE FROM music_volume').run()
    db.prepare('DELETE FROM music_config').run()
  })()
}

export function validateSourceName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name) throw new HttpError(400, 'a source needs a name')
  if (name.length > 60) throw new HttpError(400, 'name is too long (max 60 characters)')
  return name
}

export function assertSourceCapacity(db: Database.Database) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM music_sources').get() as { n: number }
  if (row.n >= MAX_MUSIC_SOURCES) {
    throw new HttpError(400, `the library holds at most ${MAX_MUSIC_SOURCES} sources`)
  }
}

export function addSource(
  db: Database.Database,
  name: string,
  kind: MusicSourceKind,
  contentId: string,
): MusicSourceView {
  assertSourceCapacity(db)

  const posRow = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM music_sources')
    .get() as { p: number }
  const isFirst = posRow.p < 0

  const result = db.prepare(`
    INSERT INTO music_sources (name, kind, content_id, position, is_default)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, kind, contentId, posRow.p + 1, isFirst ? 1 : 0)

  const created = getSource(db, Number(result.lastInsertRowid))
  if (!created) throw new HttpError(500, 'source was not created')
  return created
}

/** Exactly one default; setting one clears the rest. */
export function setDefaultSource(db: Database.Database, sourceId: number) {
  db.transaction(() => {
    db.prepare('UPDATE music_sources SET is_default = 0').run()
    db.prepare('UPDATE music_sources SET is_default = 1 WHERE id = ?').run(sourceId)
  })()
}

export function reorderSource(db: Database.Database, sourceId: number, position: number) {
  db.prepare('UPDATE music_sources SET position = ? WHERE id = ?')
    .run(Math.max(0, position), sourceId)
}

export function markSourceBrowserOnly(db: Database.Database, sourceId: number) {
  db.prepare('UPDATE music_sources SET browser_only = 1 WHERE id = ?').run(sourceId)
}

export function markSourceUnavailable(db: Database.Database, sourceId: number, unavailable: boolean) {
  db.prepare('UPDATE music_sources SET unavailable = ? WHERE id = ?')
    .run(unavailable ? 1 : 0, sourceId)
}

export function deleteSource(db: Database.Database, sourceId: number) {
  const source = getSource(db, sourceId)
  if (!source) throw new HttpError(404, 'source not found')

  db.transaction(() => {
    db.prepare('DELETE FROM music_sources WHERE id = ?').run(sourceId)
    // Keep exactly one default: promote the first remaining source.
    if (source.isDefault) {
      const next = db.prepare(
        'SELECT id FROM music_sources ORDER BY position ASC, id ASC LIMIT 1',
      ).get() as { id: number } | undefined
      if (next) db.prepare('UPDATE music_sources SET is_default = 1 WHERE id = ?').run(next.id)
    }
  })()
}

export function getPreferredTargetId(db: Database.Database): string | null {
  const row = db.prepare('SELECT preferred_target_id FROM music_config WHERE id = 1')
    .get() as { preferred_target_id: string | null } | undefined
  return row?.preferred_target_id ?? null
}

/**
 * The whole music view. `configured` is false before the player has been set
 * up — the card is absent in that case, not empty.
 *
 * Async because Sonos state is read from the speaker rather than tracked
 * server-side: a Sonos speaker is authoritative about what it is playing,
 * including audio Warren never started.
 */
export async function buildMusicView(db: Database.Database): Promise<MusicView> {
  const configured = isConfigured(db)
  const preferredTargetId = configured ? getPreferredTargetId(db) : null

  return {
    configured,
    sources: configured ? listSources(db) : [],
    preferredTargetId,
    playback: await buildPlayback(preferredTargetId),
  }
}

/** Route state reads to whichever stack owns the selected output. */
async function buildPlayback(preferredTargetId: string | null) {
  // The browser target's playback is private to the tab that owns it, so the
  // server reports idle for it rather than inventing shared state.
  if (preferredTargetId === null || preferredTargetId === BROWSER_TARGET_ID) {
    return castRuntime.getState(null)
  }

  const target = getTarget(preferredTargetId)
  if (target?.protocol === 'sonos') return sonosRuntime.getState(preferredTargetId)
  return castRuntime.getState(preferredTargetId)
}

/** Which stack drives a target, for routing commands. */
export function protocolOf(targetId: string | null): 'browser' | 'cast' | 'sonos' {
  if (targetId === null || targetId === BROWSER_TARGET_ID) return 'browser'
  return getTarget(targetId)?.protocol ?? 'cast'
}

export function getDbOrThrow(): Database.Database {
  return getDb()
}
