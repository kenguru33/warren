import { getDb } from '../../utils/db'
import { queryInflux } from '../../utils/influxdb'
import type { DiscoveredSensor } from '../../../shared/types'

export default defineEventHandler(async (): Promise<DiscoveredSensor[]> => {
  const db = getDb()

  const assigned = db
    .prepare('SELECT device_id, type FROM sensors WHERE device_id IS NOT NULL')
    .all() as { device_id: string; type: string }[]

  const assignedSet = new Set(assigned.map(s => `${s.device_id}:${s.type}`))

  // Time-series sensors from InfluxDB (temperature, humidity, motion)
  const rows = await queryInflux(`
    SELECT device_id, sensor_type, latest_value, last_seen FROM (
      SELECT device_id, sensor_type,
             value AS latest_value,
             time  AS last_seen,
             ROW_NUMBER() OVER (PARTITION BY device_id, sensor_type ORDER BY time DESC) AS rn
      FROM sensor_readings
    ) t WHERE rn = 1
    ORDER BY device_id, sensor_type
  `)

  const influxSensors: DiscoveredSensor[] = rows
    .filter(r => !assignedSet.has(`${r.device_id}:${r.sensor_type}`))
    .map(r => ({
      deviceId: String(r.device_id),
      sensorType: String(r.sensor_type),
      lastSeen: toMs(r.last_seen),
      latestValue: Number(r.latest_value),
    }))

  // Announced sensors from SQLite (cameras, etc.)
  const announcements = db
    .prepare('SELECT device_id, type, stream_url, snapshot_url, last_seen FROM sensor_announcements')
    .all() as { device_id: string; type: string; stream_url: string | null; snapshot_url: string | null; last_seen: number }[]

  const announcedSensors: DiscoveredSensor[] = announcements
    .filter(a => !assignedSet.has(`${a.device_id}:${a.type}`))
    .map(a => ({
      deviceId: a.device_id,
      sensorType: a.type,
      lastSeen: a.last_seen,
      latestValue: null,
      streamUrl: a.stream_url,
      snapshotUrl: a.snapshot_url,
    }))

  return [...influxSensors, ...announcedSensors]
})

function toMs(t: unknown): number {
  if (typeof t === 'bigint') return Number(t / 1_000_000n)
  if (t instanceof Date) return t.getTime()
  return Number(t)
}
