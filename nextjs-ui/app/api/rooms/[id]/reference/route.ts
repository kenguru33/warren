import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'

export async function PUT(req: NextRequest, ctx: RouteContext<'/api/rooms/[id]/reference'>) {
  const roomId = Number((await ctx.params).id)
  if (!roomId) return Response.json({ statusCode: 400, message: 'invalid id' }, { status: 400 })

  let body: { refTemp?: number | null; refHumidity?: number | null } = {}
  try { body = (await req.json()) ?? {} } catch {}
  const refTemp = body.refTemp ?? null
  const refHumidity = body.refHumidity ?? null

  const db = getDb()
  if (refTemp === null && refHumidity === null) {
    db.prepare('DELETE FROM room_references WHERE room_id = ?').run(roomId)
  } else {
    db.prepare(`
      INSERT INTO room_references (room_id, ref_temp, ref_humidity)
      VALUES (?, ?, ?)
      ON CONFLICT(room_id) DO UPDATE SET ref_temp = excluded.ref_temp, ref_humidity = excluded.ref_humidity
    `).run(roomId, refTemp, refHumidity)
  }
  return Response.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/rooms/[id]/reference'>) {
  const roomId = Number((await ctx.params).id)
  if (!roomId) return Response.json({ statusCode: 400, message: 'invalid id' }, { status: 400 })
  getDb().prepare('DELETE FROM room_references WHERE room_id = ?').run(roomId)
  return Response.json({ ok: true })
}
