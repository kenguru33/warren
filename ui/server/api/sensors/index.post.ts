import { getDb } from '../../utils/db'
import type { SensorType } from '../../../shared/types'

const VALID_TYPES: SensorType[] = ['temperature', 'humidity', 'camera', 'motion', 'light', 'lightlevel']

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    roomId: number
    type: SensorType
    sensorId?: number
    deviceId?: string
    label?: string
    streamUrl?: string
    snapshotUrl?: string
  }>(event)

  if (!body.roomId) throw createError({ statusCode: 400, message: 'roomId is required' })
  if (!VALID_TYPES.includes(body.type)) throw createError({ statusCode: 400, message: 'invalid type' })

  const db = getDb()

  // Re-assign an existing unassigned sensor rather than inserting a duplicate
  if (body.sensorId) {
    const result = db.prepare('UPDATE sensors SET room_id = ?, label = ? WHERE id = ? AND room_id IS NULL').run(body.roomId, body.label ?? null, body.sensorId)
    if (result.changes === 0) throw createError({ statusCode: 404, message: 'sensor not found or already assigned' })
    return { id: body.sensorId }
  }

  let streamUrl = body.streamUrl ?? null
  let snapshotUrl = body.snapshotUrl ?? null

  // For cameras with a deviceId, pull URLs from announcements if not provided
  if (body.type === 'camera' && body.deviceId && !streamUrl && !snapshotUrl) {
    const ann = db.prepare(
      'SELECT stream_url, snapshot_url FROM sensor_announcements WHERE device_id = ? AND type = ?'
    ).get(body.deviceId, 'camera') as { stream_url: string | null; snapshot_url: string | null } | undefined

    if (ann) {
      streamUrl = ann.stream_url
      snapshotUrl = ann.snapshot_url
    }
  }

  const result = db.prepare(`
    INSERT INTO sensors (room_id, type, device_id, label, stream_url, snapshot_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(body.roomId, body.type, body.deviceId ?? null, body.label ?? null, streamUrl, snapshotUrl)
  console.log(`[sensors] registered sensor id=${result.lastInsertRowid} type=${body.type} roomId=${body.roomId}`, { deviceId: body.deviceId ?? null, label: body.label ?? null })

  return { id: result.lastInsertRowid }
})
