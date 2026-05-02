import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { pruneEmptyGroups } from '@/lib/server/light-groups'

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/sensors/[id]'>) {
  const id = Number((await ctx.params).id)
  let body: { label?: string | null; roomId?: number | null } = {}
  try { body = (await req.json()) ?? {} } catch {}

  const db = getDb()
  const sets: string[] = []
  const args: (string | number | null)[] = []
  if ('label' in body) {
    sets.push('label = ?')
    args.push(body.label ?? null)
  }
  if ('roomId' in body) {
    if (body.roomId !== null && body.roomId !== undefined) {
      const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(body.roomId)
      if (!room) return Response.json({ statusCode: 404, message: 'room not found' }, { status: 404 })
    }
    sets.push('room_id = ?')
    args.push(body.roomId ?? null)
  }
  if (sets.length === 0) return Response.json({ ok: true })

  args.push(id)

  let notFound = false
  const tx = db.transaction(() => {
    const result = db.prepare(`UPDATE sensors SET ${sets.join(', ')} WHERE id = ?`).run(...args)
    if (result.changes === 0) { notFound = true; return }
    // Group membership is room-scoped: any room change invalidates it.
    if ('roomId' in body) {
      db.prepare('DELETE FROM light_group_members WHERE sensor_id = ?').run(id)
      pruneEmptyGroups(db)
    }
  })
  tx()

  if (notFound) return Response.json({ statusCode: 404, message: 'sensor not found' }, { status: 404 })

  return Response.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/sensors/[id]'>) {
  const id = Number((await ctx.params).id)
  if (!id) return Response.json({ statusCode: 400, message: 'invalid id' }, { status: 400 })

  const db = getDb()
  const sensor = db.prepare('SELECT device_id, type FROM sensors WHERE id = ?').get(id) as
    { device_id: string | null; type: string } | undefined
  if (!sensor) return Response.json({ statusCode: 404, message: 'sensor not found' }, { status: 404 })

  db.prepare('DELETE FROM sensors WHERE id = ?').run(id)

  if (sensor.device_id) {
    db.prepare('DELETE FROM sensor_announcements WHERE device_id = ? AND type = ?').run(sensor.device_id, sensor.type)
  }

  pruneEmptyGroups(db)

  return Response.json({ ok: true })
}
