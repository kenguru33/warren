import { getDb } from '../../../utils/db'

export default defineEventHandler(() => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT
      hd.device_id, hd.kind, hd.subtype, hd.name, hd.model, hd.capabilities,
      hd.last_seen, hd.available,
      s.id AS sensor_id, s.room_id,
      r.name AS room_name,
      bs.device_id AS blocked_device_id
    FROM hue_devices hd
    LEFT JOIN sensors s ON s.device_id = hd.device_id
    LEFT JOIN rooms r ON r.id = s.room_id
    LEFT JOIN blocked_sensors bs ON bs.device_id = hd.device_id
    ORDER BY hd.kind ASC, hd.name ASC
  `).all() as {
    device_id: string; kind: string; subtype: string | null
    name: string | null; model: string | null; capabilities: string | null
    last_seen: number; available: number
    sensor_id: number | null; room_id: number | null; room_name: string | null
    blocked_device_id: string | null
  }[]

  return rows.map(r => ({
    deviceId: r.device_id,
    kind: r.kind,
    subtype: r.subtype,
    name: r.name,
    model: r.model,
    capabilities: r.capabilities ? JSON.parse(r.capabilities) : null,
    lastSeen: r.last_seen,
    available: r.available === 1,
    sensorId: r.sensor_id,
    roomId: r.room_id,
    roomName: r.room_name,
    blocked: r.blocked_device_id !== null,
  }))
})
