import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { httpErrorResponse, HttpError } from '@/lib/server/errors'
import { getTarget } from '@/lib/server/cast/discovery'

/**
 * Remove a manually added target. Discovered targets are not deletable — the
 * next mDNS sweep would just put them back, so refusing is more honest than
 * appearing to delete something that reappears.
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/music/targets/[targetId]'>) {
  try {
    const { targetId } = await ctx.params
    const target = getTarget(targetId)
    if (!target) throw new HttpError(404, 'target not found')
    if (target.origin !== 'manual') {
      throw new HttpError(400, 'discovered targets cannot be removed; they reappear on the next sweep')
    }

    const db = getDb()
    db.transaction(() => {
      db.prepare('DELETE FROM music_volume WHERE target_id = ?').run(targetId)
      // The player falls back to the browser rather than keeping a dangling
      // preference pointing at a speaker that no longer exists.
      db.prepare('UPDATE music_config SET preferred_target_id = NULL WHERE preferred_target_id = ?')
        .run(targetId)
      db.prepare('DELETE FROM music_targets WHERE target_id = ?').run(targetId)
    })()

    return Response.json({ ok: true })
  } catch (err) {
    return httpErrorResponse(err)
  }
}
