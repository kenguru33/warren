import { getDb } from '../../utils/db'
import { queryInflux } from '../../utils/influxdb'
import { resolveHueName } from '../../utils/hue-name'
import type { DiscoveredSensor } from '../../../shared/types'

export default defineEventHandler(async (): Promise<DiscoveredSensor[]> => {
  const db = getDb()

  // Sensors already assigned to a room — exclude from fresh discovery
  const assignedToRoom = db
    .prepare('SELECT device_id, type FROM sensors WHERE device_id IS NOT NULL AND room_id IS NOT NULL')
    .all() as { device_id: string; type: string }[]

  // Unassigned persisted sensors (room_id IS NULL) — shown in their own section
  const unassignedDb = db
    .prepare('SELECT id, type, label, device_id, stream_url, snapshot_url, created_at FROM sensors WHERE room_id IS NULL')
    .all() as { id: number; type: string; label: string | null; device_id: string | null; stream_url: string | null; snapshot_url: string | null; created_at: number }[]

  let blocked: { device_id: string; type: string }[] = []
  try {
    blocked = db.prepare('SELECT device_id, type FROM blocked_sensors').all() as typeof blocked
  } catch {}

  const assignedSet = new Set([
    ...assignedToRoom.map(s => `${s.device_id}:${s.type}`),
    ...blocked.map(s => `${s.device_id}:${s.type}`),
    // Exclude device_ids of unassigned DB sensors — they'll appear via unassignedDb instead
    ...unassignedDb.filter(s => s.device_id).map(s => `${s.device_id}:${s.type}`),
  ])

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
    .filter(r => !String(r.device_id).startsWith('hue-'))
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

  const unassignedSensors: DiscoveredSensor[] = unassignedDb.map(s => ({
    deviceId: s.device_id,
    sensorId: s.id,
    sensorType: s.type,
    label: s.label,
    lastSeen: s.created_at,
    latestValue: null,
    streamUrl: s.stream_url,
    snapshotUrl: s.snapshot_url,
  }))

  // Hue devices that haven't been assigned to a room yet
  const hueDevices = db.prepare(`
    SELECT device_id, kind, subtype, name, display_name, capabilities, last_seen
    FROM hue_devices
    WHERE available = 1
  `).all() as {
    device_id: string; kind: string; subtype: string | null
    name: string | null; display_name: string | null
    capabilities: string | null; last_seen: number
  }[]

  const hueSensors: DiscoveredSensor[] = hueDevices
    .flatMap(h => {
      const sensorType = h.kind === 'light' ? 'light' : (h.subtype ?? '')
      if (!sensorType) return []
      if (assignedSet.has(`${h.device_id}:${sensorType}`)) return []
      const caps = h.capabilities ? (JSON.parse(h.capabilities) as { brightness?: boolean; colorTemp?: boolean; color?: boolean }) : undefined
      return [{
        deviceId: h.device_id,
        sensorType,
        label: resolveHueName(h.display_name, h.name, h.device_id),
        bridgeName: h.name,
        displayName: h.display_name,
        lastSeen: h.last_seen,
        latestValue: null,
        origin: 'hue' as const,
        capabilities: caps,
      }]
    })

  return [...influxSensors, ...announcedSensors, ...unassignedSensors, ...hueSensors]
})

function toMs(t: unknown): number {
  if (typeof t === 'bigint') return Number(t / BigInt(1_000_000))
  if (t instanceof Date) return t.getTime()
  return Number(t)
}
