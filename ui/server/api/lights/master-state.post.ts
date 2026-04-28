import { getDb } from '../../utils/db'
import { fanOutLightCommand, type FanOutMember } from '../../utils/light-groups'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ on?: boolean }>(event)
  if (body?.on === undefined) {
    throw createError({ statusCode: 400, message: 'on is required' })
  }

  const db = getDb()

  const members = db.prepare(`
    SELECT s.id AS sensor_id, s.device_id, hd.hue_resource_id, hb.ip, hb.app_key, hd.capabilities
    FROM sensors s
    INNER JOIN hue_devices hd ON hd.device_id = s.device_id
    INNER JOIN hue_bridge hb ON hb.bridge_id = hd.bridge_id
    WHERE s.type = 'light' AND s.room_id IS NOT NULL AND hd.kind = 'light'
  `).all() as FanOutMember[]

  if (members.length === 0) {
    throw createError({ statusCode: 409, message: 'no controllable lights' })
  }

  return fanOutLightCommand(db, members, { on: body.on })
})
