import type Database from 'better-sqlite3'
import {
  BACKUP_TABLES,
  isBinarySentinel,
  type BackupTableName,
  type SnapshotCell,
  type SnapshotFile,
  type SnapshotRow,
} from '@/lib/shared/backup'
import { HttpError } from '@/lib/server/errors'

// Tables to wipe before re-inserting. Reverse of BACKUP_TABLES so children
// disappear before parents. With foreign_keys = OFF the order doesn't matter
// for the DELETE itself, but staying consistent keeps the SQL legible.
const WIPE_ORDER = [...BACKUP_TABLES].reverse()

const AUTOINCREMENT_TABLES = ['rooms', 'sensors', 'hue_devices', 'light_groups'] as const

type DbBindable = string | number | bigint | null | Buffer

function decodeCell(value: SnapshotCell): DbBindable {
  if (value === null) return null
  if (isBinarySentinel(value)) return Buffer.from(value.$b64, 'base64')
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

function insertRows(
  db: Database.Database,
  tableName: BackupTableName,
  rows: SnapshotRow[],
): number {
  if (rows.length === 0) return 0
  const cols = Object.keys(rows[0])
  const colList = cols.map(c => `"${c}"`).join(', ')
  const placeholders = cols.map(() => '?').join(', ')
  const stmt = db.prepare(`INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders})`)
  for (const row of rows) {
    stmt.run(...cols.map(c => decodeCell(row[c] ?? null)))
  }
  return rows.length
}

function syncSqliteSequence(db: Database.Database) {
  // sqlite_sequence is an SQLite-internal table with no UNIQUE constraint on
  // `name`, so ON CONFLICT(name) is rejected. UPDATE-or-INSERT instead.
  const update = db.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?')
  const insert = db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)')
  for (const t of AUTOINCREMENT_TABLES) {
    const row = db.prepare(`SELECT COALESCE(MAX(id), 0) AS m FROM "${t}"`).get() as { m: number }
    const result = update.run(row.m, t)
    if (result.changes === 0) insert.run(t, row.m)
  }
}

export interface RestoreOptions {
  preserveUsername: string | null
}

export interface RestoreResult {
  rowCounts: Record<BackupTableName, number>
  preservedUser: { username: string } | null
}

export function restoreSnapshot(
  db: Database.Database,
  snapshot: SnapshotFile,
  opts: RestoreOptions,
): RestoreResult {
  const activeUsername = opts.preserveUsername
  let preservedHash: string | null = null
  if (activeUsername) {
    const row = db
      .prepare('SELECT password_hash FROM users WHERE username = ?')
      .get(activeUsername) as { password_hash: string } | undefined
    if (row) preservedHash = row.password_hash
  }

  db.pragma('foreign_keys = OFF')
  try {
    const rowCounts = {} as Record<BackupTableName, number>

    db.transaction(() => {
      for (const t of WIPE_ORDER) {
        db.prepare(`DELETE FROM "${t}"`).run()
      }

      for (const t of BACKUP_TABLES) {
        if (t === 'users') continue
        rowCounts[t] = insertRows(db, t, snapshot.tables[t])
      }

      let usersInserted = 0
      const insertUser = (row: SnapshotRow) => {
        insertRows(db, 'users', [row])
        usersInserted++
      }
      for (const row of snapshot.tables.users) {
        const username = typeof row.username === 'string' ? row.username : null
        if (username !== null && username === activeUsername) {
          if (preservedHash !== null) {
            insertUser({ ...row, password_hash: preservedHash })
          }
          // env-var fallback: no pre-restore row, skip the snapshot row entirely.
          continue
        }
        insertUser(row)
      }
      rowCounts.users = usersInserted

      syncSqliteSequence(db)

      const violations = db.pragma('foreign_key_check') as unknown[]
      if (violations.length > 0) {
        throw new HttpError(
          422,
          'Snapshot has foreign-key violations and was not restored.',
          { violations },
        )
      }
    })()

    return {
      rowCounts,
      preservedUser:
        activeUsername && preservedHash !== null ? { username: activeUsername } : null,
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }
}
