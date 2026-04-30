import { getDb } from '../../utils/db'
import { fanOutLightCommand, type FanOutMember } from '../../utils/light-groups'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ on?: boolean }>(event)
  if (body?.on === undefined) {
    throw createError({ statusCode: 400, message: 'on is required' })
  }

  const db = getDb()

  // Source: every light known to the bridge — registered or not. Unregistered
  // lights have no sensor row, so we coalesce sensor_id to 0 (only used for
  // result tracking, not a foreign key).
  const members = db.prepare(`
    SELECT COALESCE(s.id, 0) AS sensor_id, hd.device_id, hd.hue_resource_id, hb.ip, hb.app_key, hd.capabilities
    FROM hue_devices hd
    INNER JOIN hue_bridge hb ON hb.bridge_id = hd.bridge_id
    LEFT JOIN sensors s ON s.device_id = hd.device_id AND s.type = 'light'
    WHERE hd.kind = 'light'
  `).all() as FanOutMember[]

  if (members.length === 0) {
    throw createError({ statusCode: 409, message: 'no controllable lights' })
  }

  return fanOutLightCommand(db, members, { on: body.on })
})
