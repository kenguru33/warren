import type Database from 'better-sqlite3'
import {
  BACKUP_TABLES,
  SNAPSHOT_SCHEMA_VERSION,
  type BackupTableName,
  type SnapshotCell,
  type SnapshotFile,
  type SnapshotRow,
  type SnapshotTables,
} from '@/lib/shared/backup'
import { getAppVersion } from './app-version'
import { getOrCreateHostId } from './host-id'

function encodeCell(value: unknown): SnapshotCell {
  if (value === null) return null
  if (Buffer.isBuffer(value)) return { $b64: value.toString('base64') }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  // Defensive: unknown column type. Stringify so the snapshot stays JSON-safe.
  return String(value)
}

function encodeRow(row: Record<string, unknown>): SnapshotRow {
  const out: SnapshotRow = {}
  for (const key of Object.keys(row)) {
    out[key] = encodeCell(row[key])
  }
  return out
}

export function buildSnapshot(db: Database.Database): SnapshotFile {
  const tables = {} as SnapshotTables
  const rowCounts = {} as Record<BackupTableName, number>

  for (const name of BACKUP_TABLES) {
    const rows = db.prepare(`SELECT * FROM ${name}`).all() as Record<string, unknown>[]
    tables[name] = rows.map(encodeRow)
    rowCounts[name] = rows.length
  }

  return {
    header: {
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      app_version: getAppVersion(),
      host_id: getOrCreateHostId(db),
      exported_at: Date.now(),
      row_counts: rowCounts,
    },
    tables,
  }
}
