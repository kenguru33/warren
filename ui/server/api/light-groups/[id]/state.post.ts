import { getDb } from '../../../utils/db'
import { fanOutLightCommand, type FanOutMember } from '../../../utils/light-groups'

export default defineEventHandler(async (event) => {
  const groupId = Number(getRouterParam(event, 'id'))
  if (!groupId) throw createError({ statusCode: 400, message: 'invalid group id' })

  const body = await readBody<{ on?: boolean; brightness?: number }>(event)
  if (body?.on === undefined && body?.brightness === undefined) {
    throw createError({ statusCode: 400, message: 'on or brightness is required' })
  }
  if (body.brightness !== undefined && (body.brightness < 0 || body.brightness > 100)) {
    throw createError({ statusCode: 400, message: 'brightness must be 0-100' })
  }

  const db = getDb()
  const group = db.prepare('SELECT id FROM light_groups WHERE id = ?').get(groupId) as { id: number } | undefined
  if (!group) throw createError({ statusCode: 404, message: 'group not found' })

  const members = db.prepare(`
    SELECT m.sensor_id, s.device_id, hd.hue_resource_id, hb.ip, hb.app_key, hd.capabilities
    FROM light_group_members m
    INNER JOIN sensors s ON s.id = m.sensor_id
    INNER JOIN hue_devices hd ON hd.device_id = s.device_id
    INNER JOIN hue_bridge hb ON hb.bridge_id = hd.bridge_id
    WHERE m.group_id = ? AND hd.kind = 'light'
  `).all(groupId) as FanOutMember[]

  if (members.length === 0) {
    throw createError({ statusCode: 409, message: 'group has no controllable lights' })
  }

  return fanOutLightCommand(db, members, body)
})
