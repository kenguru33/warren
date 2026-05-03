import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import {
  fanOutLightCommand,
  maybeCoerceGroupTheme,
  validateGroupTheme,
  type FanOutMember,
} from '@/lib/server/light-groups'
import { resolveLightTheme } from '@/lib/shared/light-themes'
import { httpErrorResponse } from '@/lib/server/errors'

export async function POST(req: NextRequest, ctx: RouteContext<'/api/light-groups/[id]/state'>) {
  try {
    const groupId = Number((await ctx.params).id)
    if (!groupId) return Response.json({ statusCode: 400, message: 'invalid group id' }, { status: 400 })

    let body: { on?: boolean; brightness?: number; theme?: string } = {}
    try { body = (await req.json()) ?? {} } catch {}

    if (body.on === undefined && body.brightness === undefined) {
      return Response.json({ statusCode: 400, message: 'on or brightness is required' }, { status: 400 })
    }
    if (body.brightness !== undefined && (body.brightness < 0 || body.brightness > 100)) {
      return Response.json({ statusCode: 400, message: 'brightness must be 0-100' }, { status: 400 })
    }
    const themeOverride = body.theme !== undefined ? validateGroupTheme(body.theme) : null

    const db = getDb()
    const group = db.prepare('SELECT id, theme FROM light_groups WHERE id = ?')
      .get(groupId) as { id: number; theme: string | null } | undefined
    if (!group) return Response.json({ statusCode: 404, message: 'group not found' }, { status: 404 })

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
      return Response.json({ statusCode: 409, message: 'group has no controllable lights' }, { status: 409 })
    }

    // Coerce a stale color theme on a now-white-only group before reading group.theme
    // for fan-out paint. Idempotent: a no-op for already-coerced or qualifying groups.
    const coerced = maybeCoerceGroupTheme(db, group, members)
    const theme = resolveLightTheme(themeOverride ?? coerced.theme)
    const summary = await fanOutLightCommand(db, members, body, theme)
    return Response.json(summary)
  } catch (err) {
    return httpErrorResponse(err)
  }
}
