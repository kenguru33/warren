import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { httpErrorResponse, HttpError } from '@/lib/server/errors'
import {
  isConfigured, getSource, listSources,
  getPreferredTargetId, buildMusicView, markSourceBrowserOnly,
} from '@/lib/server/music'
import { castRuntime, type TransportCommand } from '@/lib/server/cast/runtime'
import { BROWSER_TARGET_ID } from '@/lib/shared/types'

const TRANSPORT = new Set<TransportCommand>(['play', 'pause', 'next', 'previous', 'stop'])

interface CommandBody {
  command?: string
  sourceId?: number
  positionMs?: number
  volume?: number
}

/**
 * Transport commands for the player's current output target.
 *
 * For a cast target this reaches the device. For the browser target the server
 * holds no playback state — audio lives in the tab — so it returns the intent
 * plus the resolved source for the client to act on.
 */
export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    if (!isConfigured(db)) throw new HttpError(404, 'music is not configured')

    let body: CommandBody = {}
    try { body = (await req.json()) ?? {} } catch { /* validated below */ }

    const command = typeof body.command === 'string' ? body.command : ''
    const targetId = getPreferredTargetId(db)
    const isBrowser = targetId === null || targetId === BROWSER_TARGET_ID

    // Resolve which source to act on: explicit, else the library's default.
    let sourceId = typeof body.sourceId === 'number' ? body.sourceId : null
    if (command === 'play' && sourceId === null) {
      sourceId = listSources(db).find(s => s.isDefault)?.id ?? null
    }

    if (isBrowser) {
      // The client owns playback; hand back what it needs to act.
      const source = sourceId !== null ? getSource(db, sourceId) : null
      if (command === 'play' && !source) throw new HttpError(400, 'no source to play')
      return Response.json({ target: 'browser', command, source })
    }

    if (command === 'play') {
      if (sourceId === null) throw new HttpError(400, 'no source to play')
      const source = getSource(db, sourceId)
      if (!source) throw new HttpError(404, 'source not found')

      const result = await castRuntime.play({
        targetId: targetId!,
        sourceId: source.id,
        kind: source.kind,
        contentId: source.contentId,
      })

      if (!result.ok) {
        // Content that will not resolve anonymously is browser-only, not broken.
        if (result.browserOnly) markSourceBrowserOnly(db, source.id)
        return Response.json(
          {
            statusCode: 502,
            message: result.error,
            data: { error: result.browserOnly ? 'browser_only' : 'cast_failed' },
            music: buildMusicView(db),
          },
          { status: 502 },
        )
      }
      return Response.json(buildMusicView(db))
    }

    if (command === 'seek') {
      const positionMs = typeof body.positionMs === 'number' ? body.positionMs : null
      if (positionMs === null) throw new HttpError(400, 'seek needs positionMs')
      const result = await castRuntime.seek(positionMs)
      if (!result.ok) throw new HttpError(502, result.error)
      return Response.json(buildMusicView(db))
    }

    if (command === 'volume') {
      const volume = typeof body.volume === 'number' ? body.volume : null
      if (volume === null) throw new HttpError(400, 'volume needs a value')
      const result = await castRuntime.setVolume(volume)
      if (!result.ok) throw new HttpError(502, result.error)
      return Response.json(buildMusicView(db))
    }

    if (!TRANSPORT.has(command as TransportCommand)) {
      throw new HttpError(400, `unknown command "${command}"`)
    }

    const result = await castRuntime.transport(command as TransportCommand)
    if (!result.ok) throw new HttpError(502, result.error)
    return Response.json(buildMusicView(db))
  } catch (err) {
    return httpErrorResponse(err)
  }
}
