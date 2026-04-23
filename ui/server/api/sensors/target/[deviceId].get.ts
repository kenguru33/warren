import { getDb } from '../../../utils/db'

export default defineEventHandler((event) => {
  const deviceId = getRouterParam(event, 'deviceId')
  if (!deviceId) throw createError({ statusCode: 400, message: 'deviceId is required' })

  const db = getDb()
  const row = db.prepare(`
    SELECT r.id AS roomId, r.name AS roomName,
           rr.ref_temp AS refTemp, rr.ref_humidity AS refHumidity
    FROM sensors s
    JOIN rooms r ON s.room_id = r.id
    LEFT JOIN room_references rr ON rr.room_id = r.id
    WHERE s.device_id = ?
    LIMIT 1
  `).get(deviceId) as
    | { roomId: number; roomName: string; refTemp: number | null; refHumidity: number | null }
    | undefined

  if (!row) {
    return { deviceId, roomId: null, roomName: null, refTemp: null, refHumidity: null }
  }

  return {
    deviceId,
    roomId: row.roomId,
    roomName: row.roomName,
    refTemp: row.refTemp,
    refHumidity: row.refHumidity,
  }
})
