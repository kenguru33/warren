import { getDb } from '../../../utils/db'
import { fanOutLightCommand, type FanOutMember } from '../../../utils/light-groups'

export default defineEventHandler(async (event) => {
  const roomId = Number(getRouterParam(event, 'id'))
  if (!roomId) throw createError({ statusCode: 400, message: 'invalid room id' })

  const body = await readBody<{ on?: boolean }>(event)
  if (body?.on === undefined) {
    throw createError({ statusCode: 400, message: 'on is required' })
  }

  const db = getDb()
  const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId) as { id: number } | undefined
  if (!room) throw createError({ statusCode: 404, message: 'room not found' })

  const members = db.prepare(`
    SELECT s.id AS sensor_id, s.device_id, hd.hue_resource_id, hb.ip, hb.app_key, hd.capabilities
    FROM sensors s
    INNER JOIN hue_devices hd ON hd.device_id = s.device_id
    INNER JOIN hue_bridge hb ON hb.bridge_id = hd.bridge_id
    WHERE s.room_id = ? AND s.type = 'light' AND hd.kind = 'light'
  `).all(roomId) as FanOutMember[]

  if (members.length === 0) {
    throw createError({ statusCode: 409, message: 'room has no controllable lights' })
  }

  return fanOutLightCommand(db, members, { on: body.on })
})
