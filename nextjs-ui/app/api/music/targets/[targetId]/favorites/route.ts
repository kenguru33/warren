import type { NextRequest } from 'next/server'
import { httpErrorResponse, HttpError } from '@/lib/server/errors'
import { getTarget } from '@/lib/server/targets'
import { sonosRuntime } from '@/lib/server/sonos/runtime'
import type { SonosFavoriteView } from '@/lib/shared/types'

/**
 * The Sonos Favorites available on a target.
 *
 * Read live from the speaker on every request rather than cached: the Sonos app
 * owns this list and can change it at any time, so a stored copy would offer
 * content that no longer exists.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<'/api/music/targets/[targetId]/favorites'>) {
  try {
    const { targetId } = await ctx.params
    const target = getTarget(targetId)
    if (!target) throw new HttpError(404, 'target not found')
    if (target.protocol !== 'sonos') {
      // Favorites are a Sonos concept; a Cast target has Warren's own library.
      throw new HttpError(400, 'favorites are only available on a Sonos target')
    }

    const result = await sonosRuntime.favorites(targetId)
    if (!result.ok) throw new HttpError(502, result.error)

    const view: SonosFavoriteView[] = result.value.map(f => ({
      id: f.id,
      title: f.title,
      artworkUrl: f.artworkUrl,
    }))
    return Response.json(view)
  } catch (err) {
    return httpErrorResponse(err)
  }
}
