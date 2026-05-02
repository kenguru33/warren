import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { pruneEmptyGroups } from '@/lib/server/light-groups'
import { httpErrorResponse } from '@/lib/server/errors'

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<'/api/light-groups/[id]/members/[sensorId]'>,
) {
  try {
    const params = await ctx.params
    const groupId = Number(params.id)
    const sensorId = Number(params.sensorId)
    if (!groupId || !sensorId) {
      return Response.json({ statusCode: 400, message: 'invalid id' }, { status: 400 })
    }

    const db = getDb()
    const tx = db.transaction(() => {
      const result = db
        .prepare('DELETE FROM light_group_members WHERE group_id = ? AND sensor_id = ?')
        .run(groupId, sensorId)
      if (result.changes === 0) return false
      pruneEmptyGroups(db)
      return true
    })

    if (!tx()) {
      return Response.json({ statusCode: 404, message: 'membership not found' }, { status: 404 })
    }
    return Response.json({ ok: true })
  } catch (err) {
    return httpErrorResponse(err)
  }
}
