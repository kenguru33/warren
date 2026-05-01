import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { pruneEmptyGroups } from '@/lib/server/light-groups'

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/rooms/[id]/sensors/[sensorId]'>) {
  const params = await ctx.params
  const roomId = Number(params.id)
  const sensorId = Number(params.sensorId)
  if (!roomId || !sensorId) return Response.json({ statusCode: 400, message: 'invalid id' }, { status: 400 })

  const db = getDb()
  let notFound = false
  const tx = db.transaction(() => {
    const result = db
      .prepare('UPDATE sensors SET room_id = NULL WHERE id = ? AND room_id = ?')
      .run(sensorId, roomId)
    if (result.changes === 0) { notFound = true; return }
    db.prepare('DELETE FROM light_group_members WHERE sensor_id = ?').run(sensorId)
    pruneEmptyGroups(db)
  })
  tx()

  if (notFound) return Response.json({ statusCode: 404, message: 'sensor not found in room' }, { status: 404 })
  return Response.json({ ok: true })
}
