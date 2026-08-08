import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { httpErrorResponse, HttpError } from '@/lib/server/errors'
import {
  buildMusicView, enableMusic, disableMusic, isConfigured, getPreferredTargetId,
} from '@/lib/server/music'
import { getTarget } from '@/lib/server/cast/discovery'
import { castRuntime } from '@/lib/server/cast/runtime'
import { BROWSER_TARGET_ID } from '@/lib/shared/types'

/**
 * The music player is global — one library, one output, one playback state —
 * so this collection has no room in its path. `configured: false` is a normal
 * response, not an error: it is how the dashboard knows to offer setup.
 */
export async function GET() {
  try {
    return Response.json(await buildMusicView(getDb()))
  } catch (err) {
    return httpErrorResponse(err)
  }
}

/** Create or update the music configuration. */
export async function PUT(req: NextRequest) {
  try {
    const db = getDb()

    let body: { preferredTargetId?: string | null } = {}
    try { body = (await req.json()) ?? {} } catch { /* empty body enables with defaults */ }

    let preferredTargetId: string | null = null
    if (typeof body.preferredTargetId === 'string' && body.preferredTargetId) {
      preferredTargetId = body.preferredTargetId
      if (preferredTargetId !== BROWSER_TARGET_ID && !getTarget(preferredTargetId)) {
        throw new HttpError(400, 'unknown output target')
      }
    }

    // Switching output moves the player; drop whatever the old target held so
    // two speakers never end up playing at once.
    const previous = isConfigured(db) ? getPreferredTargetId(db) : null
    enableMusic(db, preferredTargetId)
    if (previous !== null && previous !== preferredTargetId) castRuntime.release()

    return Response.json(await buildMusicView(db))
  } catch (err) {
    return httpErrorResponse(err)
  }
}

export async function DELETE() {
  try {
    disableMusic(getDb())
    return Response.json({ ok: true })
  } catch (err) {
    return httpErrorResponse(err)
  }
}
