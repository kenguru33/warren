import { getDb } from '../../../utils/db'
import {
  fanOutLightCommand,
  validateGroupTheme,
  type FanOutMember,
} from '../../../utils/light-groups'
import { resolveLightTheme } from '../../../../shared/utils/light-themes'

export default defineEventHandler(async (event) => {
  const groupId = Number(getRouterParam(event, 'id'))
  if (!groupId) throw createError({ statusCode: 400, message: 'invalid group id' })

  const body = await readBody<{ on?: boolean; brightness?: number; theme?: string }>(event)
  if (body?.on === undefined && body?.brightness === undefined) {
    throw createError({ statusCode: 400, message: 'on or brightness is required' })
  }
  if (body.brightness !== undefined && (body.brightness < 0 || body.brightness > 100)) {
    throw createError({ statusCode: 400, message: 'brightness must be 0-100' })
  }
  // Optional one-shot theme override: paint with this theme's palette without persisting it.
  // Used by the modal's live preview when the user changes the dropdown.
  const themeOverride = body.theme !== undefined ? validateGroupTheme(body.theme) : null

  const db = getDb()
  const group = db.prepare('SELECT id, theme FROM light_groups WHERE id = ?')
    .get(groupId) as { id: number; theme: string | null } | undefined
  if (!group) throw createError({ statusCode: 404, message: 'group not found' })

  const members = db.prepare(`
    SELECT m.sensor_id, s.device_id, hd.hue_resource_id, hb.ip, hb.app_key, hd.capabilities
    FROM light_group_members m
    INNER JOIN sensors s ON s.id = m.sensor_id
    INNER JOIN hue_devices hd ON hd.device_id = s.device_id
    INNER JOIN hue_bridge hb ON hb.bridge_id = hd.bridge_id
    WHERE m.group_id = ? AND hd.kind = 'light'
    ORDER BY m.sensor_id ASC
  `).all(groupId) as FanOutMember[]

  if (members.length === 0) {
    throw createError({ statusCode: 409, message: 'group has no controllable lights' })
  }

  // Override key wins for color resolution; otherwise use the group's stored theme.
  const theme = resolveLightTheme(themeOverride ?? group.theme)
  return fanOutLightCommand(db, members, body, theme)
})
