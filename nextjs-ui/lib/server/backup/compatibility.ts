import { SNAPSHOT_SCHEMA_VERSION, type SnapshotFile } from '@/lib/shared/backup'

export interface CompatibilityResult {
  compatible: boolean
  warnings: string[]
  errors: string[]
}

export function assessCompatibility(snapshot: SnapshotFile): CompatibilityResult {
  const warnings: string[] = []
  const errors: string[] = []

  if (snapshot.header.schema_version !== SNAPSHOT_SCHEMA_VERSION) {
    errors.push(
      `Snapshot was created with Warren schema v${snapshot.header.schema_version}; this host expects v${SNAPSHOT_SCHEMA_VERSION}. Upgrade or downgrade Warren to match before restoring.`,
    )
  }

  const tables = snapshot.tables
  const roomIds = new Set<unknown>(tables.rooms.map(r => r.id))
  const sensorIds = new Set<unknown>(tables.sensors.map(s => s.id))
  const lightGroupIds = new Set<unknown>(tables.light_groups.map(g => g.id))
  const hueDeviceIds = new Set<unknown>(tables.hue_devices.map(d => d.device_id))

  if (tables.hue_bridge.length === 0 && tables.hue_devices.length > 0) {
    warnings.push('Snapshot has Hue devices but no bridge row; the Hue runtime will idle until you re-pair.')
  }

  for (const s of tables.sensors) {
    if (s.room_id !== null && s.room_id !== undefined && !roomIds.has(s.room_id)) {
      warnings.push(`Sensor ${String(s.id)} references missing room ${String(s.room_id)}.`)
    }
  }

  for (const g of tables.light_groups) {
    if (!roomIds.has(g.room_id)) {
      warnings.push(`Light group ${String(g.id)} references missing room ${String(g.room_id)}.`)
    }
  }

  for (const m of tables.light_group_members) {
    if (!sensorIds.has(m.sensor_id)) {
      warnings.push(`Light group member references missing sensor ${String(m.sensor_id)}.`)
    }
    if (!lightGroupIds.has(m.group_id)) {
      warnings.push(`Light group member references missing group ${String(m.group_id)}.`)
    }
  }

  for (const ls of tables.hue_light_state) {
    if (!hueDeviceIds.has(ls.device_id)) {
      warnings.push(`Hue light state references missing device ${String(ls.device_id)}.`)
    }
  }

  return {
    compatible: errors.length === 0,
    warnings,
    errors,
  }
}
