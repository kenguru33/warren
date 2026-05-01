import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/rooms/[id]'>) {
  const id = Number((await ctx.params).id)
  if (!id) return Response.json({ statusCode: 400, message: 'invalid id' }, { status: 400 })

  let body: { name?: string } = {}
  try { body = (await req.json()) ?? {} } catch {}
  const name = body.name?.trim()
  if (!name) return Response.json({ statusCode: 400, message: 'name is required' }, { status: 400 })

  const db = getDb()
  const result = db.prepare('UPDATE rooms SET name = ? WHERE id = ?').run(name, id)
  if (result.changes === 0) return Response.json({ statusCode: 404, message: 'room not found' }, { status: 404 })
  return Response.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/rooms/[id]'>) {
  const id = Number((await ctx.params).id)
  if (!id) return Response.json({ statusCode: 400, message: 'invalid id' }, { status: 400 })

  const db = getDb()
  const result = db.prepare('DELETE FROM rooms WHERE id = ?').run(id)
  if (result.changes === 0) return Response.json({ statusCode: 404, message: 'room not found' }, { status: 404 })
  return Response.json({ ok: true })
}
