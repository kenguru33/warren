import { getDb } from '@/lib/server/db'
import { httpErrorResponse } from '@/lib/server/errors'
import { buildMusicView } from '@/lib/server/music'

/**
 * Current playback state. The `stale` flag is explicit rather than left for the
 * client to infer from `updatedAt`: a cast target we cannot read must never
 * render as idle.
 */
export async function GET() {
  try {
    const view = buildMusicView(getDb())
    return Response.json({
      ...view.playback,
      stale: view.playback.status === 'unknown',
    })
  } catch (err) {
    return httpErrorResponse(err)
  }
}
