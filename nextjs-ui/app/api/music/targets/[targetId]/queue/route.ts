import type { NextRequest } from 'next/server'
import { httpErrorResponse, HttpError } from '@/lib/server/errors'
import { getTarget } from '@/lib/server/targets'
import { sonosRuntime, type QueueAction } from '@/lib/server/sonos/runtime'

const ACTIONS = new Set<QueueAction>(['play', 'remove', 'move'])

type Ctx = RouteContext<'/api/music/targets/[targetId]/queue'>

/**
 * A Sonos speaker's queue.
 *
 * The queue is the only content surface the local Sonos stack exposes that
 * Warren does not already show — the linked music services are not browsable
 * over the LAN — so this is what choosing "what plays next" can mean without
 * a Sonos account.
 */
async function requireSonosTarget(ctx: Ctx): Promise<string> {
  const { targetId } = await ctx.params
  const target = getTarget(targetId)
  if (!target) throw new HttpError(404, 'target not found')
  if (target.protocol !== 'sonos') {
    // A queue is a Sonos concept; Cast and the browser have Warren's library.
    throw new HttpError(400, 'a queue is only available on a Sonos target')
  }
  return targetId
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const targetId = await requireSonosTarget(ctx)
    const result = await sonosRuntime.queue(targetId)
    if (!result.ok) throw new HttpError(502, result.error)
    return Response.json(result.value)
  } catch (err) {
    return httpErrorResponse(err)
  }
}

/**
 * One endpoint with an action discriminator rather than three routes: they
 * share target resolution, the guards, and the re-read, and splitting them
 * would triplicate all of it.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const targetId = await requireSonosTarget(ctx)

    let body: { action?: string; index?: number; toIndex?: number } = {}
    try { body = (await req.json()) ?? {} } catch { /* validated below */ }

    const action = typeof body.action === 'string' ? body.action : ''
    if (!ACTIONS.has(action as QueueAction)) {
      throw new HttpError(400, `unknown queue action "${action}"`)
    }

    // A bad index is our own client sending nonsense, which is a client error
    // rather than a speaker failure — a 502 here would point at the wrong thing.
    const index = typeof body.index === 'number' ? body.index : null
    if (index === null || !Number.isInteger(index) || index < 1) {
      throw new HttpError(400, 'a queue action needs a 1-based index')
    }

    const toIndex = typeof body.toIndex === 'number' ? body.toIndex : undefined
    if (action === 'move' && (toIndex === undefined || !Number.isInteger(toIndex) || toIndex < 1)) {
      throw new HttpError(400, 'moving needs a 1-based toIndex')
    }

    const result = await sonosRuntime.mutateQueue(targetId, action as QueueAction, index, toIndex)
    if (!result.ok) throw new HttpError(502, result.error)
    return Response.json(result.value)
  } catch (err) {
    return httpErrorResponse(err)
  }
}
