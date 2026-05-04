import {
  BACKUP_TABLES,
  type BackupTableName,
  type SnapshotFile,
  type SnapshotRow,
  type SnapshotTables,
} from '@/lib/shared/backup'
import { HttpError } from '@/lib/server/errors'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function bad(message: string): never {
  throw new HttpError(400, message)
}

export interface ParseResult {
  snapshot: SnapshotFile
  warnings: string[]
}

export function parseSnapshot(rawText: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    bad('Snapshot is not valid JSON.')
  }

  if (!isPlainObject(parsed)) bad('Snapshot must be a JSON object.')
  if (!isPlainObject(parsed.header)) bad('Snapshot is missing a header.')
  if (!isPlainObject(parsed.tables)) bad('Snapshot is missing a tables block.')

  const header = parsed.header
  if (typeof header.schema_version !== 'number') bad('header.schema_version must be a number.')
  if (typeof header.app_version !== 'string') bad('header.app_version must be a string.')
  if (header.host_id !== null && typeof header.host_id !== 'string') {
    bad('header.host_id must be a string or null.')
  }
  if (typeof header.exported_at !== 'number') bad('header.exported_at must be a number.')
  if (!isPlainObject(header.row_counts)) bad('header.row_counts must be an object.')

  const warnings: string[] = []
  const tablesIn = parsed.tables as Record<string, unknown>
  const tablesOut = {} as SnapshotTables
  const rowCountsOut = {} as Record<BackupTableName, number>

  for (const name of BACKUP_TABLES) {
    const value = tablesIn[name]
    if (value === undefined) {
      warnings.push(`Snapshot is missing table "${name}". It will be left empty after restore.`)
      tablesOut[name] = []
      rowCountsOut[name] = 0
      continue
    }
    if (!Array.isArray(value)) bad(`tables.${name} must be an array.`)
    const rows: SnapshotRow[] = []
    for (let i = 0; i < value.length; i++) {
      const row = value[i]
      if (!isPlainObject(row)) bad(`tables.${name}[${i}] must be an object.`)
      rows.push(row as SnapshotRow)
    }
    tablesOut[name] = rows
    rowCountsOut[name] = rows.length
  }

  const snapshot: SnapshotFile = {
    header: {
      schema_version: header.schema_version,
      app_version: header.app_version,
      host_id: header.host_id ?? null,
      exported_at: header.exported_at,
      row_counts: rowCountsOut,
    },
    tables: tablesOut,
  }

  return { snapshot, warnings }
}
