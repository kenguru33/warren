export const SNAPSHOT_SCHEMA_VERSION = 1

// Forward foreign-key dependency order. The restore engine wipes in reverse
// and inserts in this order; reordering breaks FK enforcement during restore.
export const BACKUP_TABLES = [
  'rooms',
  'room_references',
  'sensors',
  'sensor_config',
  'sensor_announcements',
  'blocked_sensors',
  'hue_bridge',
  'hue_devices',
  'hue_light_state',
  'light_groups',
  'light_group_members',
  'users',
  'meta',
] as const

export type BackupTableName = (typeof BACKUP_TABLES)[number]

export interface BinarySentinel {
  $b64: string
}

export type SnapshotCell = string | number | boolean | null | BinarySentinel

export type SnapshotRow = Record<string, SnapshotCell>

export type SnapshotTables = Record<BackupTableName, SnapshotRow[]>

export interface SnapshotHeader {
  schema_version: number
  app_version: string
  host_id: string | null
  exported_at: number
  row_counts: Record<BackupTableName, number>
}

export interface SnapshotFile {
  header: SnapshotHeader
  tables: SnapshotTables
}

export function isBinarySentinel(value: unknown): value is BinarySentinel {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$b64' in value &&
    typeof (value as { $b64: unknown }).$b64 === 'string'
  )
}
