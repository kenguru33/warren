import { getDb } from '../../utils/db'
import { queryInflux } from '../../utils/influxdb'
import type { RoomWithSensors, SensorView } from '../../../shared/types'

function toMs(t: unknown): number {
  if (typeof t === 'bigint') return Number(t / BigInt(1_000_000))
  if (t instanceof Date) return t.getTime()
  return Number(t)
}

export default defineEventHandler(async (): Promise<RoomWithSensors[]> => {
  const db = getDb()

  const rooms = db.prepare('SELECT id, name FROM rooms ORDER BY created_at ASC').all() as { id: number; name: string }[]
  const sensors = db.prepare(`
    SELECT id, room_id, type, device_id, label, stream_url, snapshot_url FROM sensors ORDER BY created_at ASC
  `).all() as {
    id: number; room_id: number; type: string; device_id: string | null
    label: string | null; stream_url: string | null; snapshot_url: string | null
  }[]

  const latestMap = new Map<string, { value: number; timeMs: number }>()
  for (const row of await queryInflux(`
    SELECT device_id, sensor_type, latest_value, last_recorded_at FROM (
      SELECT device_id, sensor_type,
             value AS latest_value,
             time  AS last_recorded_at,
             ROW_NUMBER() OVER (PARTITION BY device_id, sensor_type ORDER BY time DESC) AS rn
      FROM sensor_readings
    ) t WHERE rn = 1
  `)) {
    latestMap.set(`${row.device_id}:${row.sensor_type}`, {
      value: Number(row.latest_value),
      timeMs: toMs(row.last_recorded_at),
    })
  }

  const motionMap = new Map<string, number>()
  for (const row of await queryInflux(`
    SELECT device_id, last_motion_at FROM (
      SELECT device_id,
             time AS last_motion_at,
             ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY time DESC) AS rn
      FROM sensor_readings
      WHERE sensor_type = 'motion' AND value = 1
    ) t WHERE rn = 1
  `)) {
    motionMap.set(String(row.device_id), toMs(row.last_motion_at))
  }

  const refStmt = db.prepare('SELECT ref_temp, ref_humidity FROM room_references WHERE room_id = ?')

  return rooms.map(room => {
    const ref = refStmt.get(room.id) as { ref_temp: number | null; ref_humidity: number | null } | undefined

    const sensorViews: SensorView[] = sensors
      .filter(s => s.room_id === room.id)
      .map(s => {
        const key = s.device_id ? `${s.device_id}:${s.type}` : null
        const latest = key ? latestMap.get(key) : undefined
        return {
          id: s.id,
          roomId: s.room_id,
          type: s.type as SensorView['type'],
          deviceId: s.device_id,
          label: s.label,
          latestValue: latest?.value ?? null,
          lastRecordedAt: latest?.timeMs ?? null,
          streamUrl: s.stream_url,
          snapshotUrl: s.snapshot_url,
          lastMotion: s.device_id ? (motionMap.get(s.device_id) ?? null) : null,
        }
      })

    return {
      id: room.id,
      name: room.name,
      reference: ref ? { refTemp: ref.ref_temp, refHumidity: ref.ref_humidity } : null,
      sensors: sensorViews,
    }
  })
})
