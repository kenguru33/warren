import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { fanOutLightCommand, type FanOutMember } from '@/lib/server/light-groups'

export async function POST(req: NextRequest, ctx: RouteContext<'/api/rooms/[id]/lights-state'>) {
  const roomId = Number((await ctx.params).id)
  if (!roomId) return Response.json({ statusCode: 400, message: 'invalid room id' }, { status: 400 })

  let body: { on?: boolean } = {}
  try { body = (await req.json()) ?? {} } catch {}
  if (body.on === undefined) {
    return Response.json({ statusCode: 400, message: 'on is required' }, { status: 400 })
  }

  const db = getDb()
  const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId) as { id: number } | undefined
  if (!room) return Response.json({ statusCode: 404, message: 'room not found' }, { status: 404 })

  const members = db.prepare(`
    SELECT s.id AS sensor_id, s.device_id, hd.hue_resource_id, hb.ip, hb.app_key, hd.capabilities
    FROM sensors s
    INNER JOIN hue_devices hd ON hd.device_id = s.device_id
    INNER JOIN hue_bridge hb ON hb.bridge_id = hd.bridge_id
    WHERE s.room_id = ? AND s.type = 'light' AND hd.kind = 'light'
  `).all(roomId) as FanOutMember[]

  if (members.length === 0) {
    return Response.json({ statusCode: 409, message: 'room has no controllable lights' }, { status: 409 })
  }

  const summary = await fanOutLightCommand(db, members, { on: body.on })
  return Response.json(summary)
}
