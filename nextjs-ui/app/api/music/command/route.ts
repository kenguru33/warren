import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { httpErrorResponse, HttpError } from '@/lib/server/errors'
import {
  isConfigured, getSource, listSources, protocolOf,
  getPreferredTargetId, buildMusicView, markSourceBrowserOnly,
} from '@/lib/server/music'
import { castRuntime, type TransportCommand } from '@/lib/server/cast/runtime'
import { sonosRuntime } from '@/lib/server/sonos/runtime'

const TRANSPORT = new Set<TransportCommand>(['play', 'pause', 'next', 'previous', 'stop'])

interface CommandBody {
  command?: string
  sourceId?: number
  /** Sonos only: the favorite to start. Sonos has no Warren-side source id. */
  favoriteId?: string
  positionMs?: number
  volume?: number
}

/**
 * Transport commands for the player's current output target.
 *
 * Three stacks answer here, and which one depends on the selected output:
 *   - browser — the server holds no playback state (audio lives in the tab), so
 *     it returns the intent plus the resolved source for the client to act on.
 *   - cast    — reaches the device through CASTV2.
 *   - sonos   — reaches the device through UPnP, and plays *favorites* rather
 *     than Warren's YouTube sources, which it cannot resolve.
 */
export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    if (!isConfigured(db)) throw new HttpError(404, 'music is not configured')

    let body: CommandBody = {}
    try { body = (await req.json()) ?? {} } catch { /* validated below */ }

    const command = typeof body.command === 'string' ? body.command : ''
    const targetId = getPreferredTargetId(db)
    const protocol = protocolOf(targetId)

    if (protocol === 'sonos') return await handleSonos(db, targetId!, command, body)
    if (protocol === 'browser') return handleBrowser(db, command, body)
    return await handleCast(db, targetId!, command, body)
  } catch (err) {
    return httpErrorResponse(err)
  }
}

function handleBrowser(db: ReturnType<typeof getDb>, command: string, body: CommandBody) {
  // Resolve which source to act on: explicit, else the library's default.
  let sourceId = typeof body.sourceId === 'number' ? body.sourceId : null
  if (command === 'play' && sourceId === null) {
    sourceId = listSources(db).find(s => s.isDefault)?.id ?? null
  }

  // The client owns playback; hand back what it needs to act.
  const source = sourceId !== null ? getSource(db, sourceId) : null
  if (command === 'play' && !source) throw new HttpError(400, 'no source to play')
  return Response.json({ target: 'browser', command, source })
}

/**
 * Sonos takes a favorite id, not a Warren source id. Warren's YouTube library
 * is not reachable on a Sonos speaker, so accepting a sourceId here would
 * promise something that cannot happen.
 */
async function handleSonos(
  db: ReturnType<typeof getDb>,
  targetId: string,
  command: string,
  body: CommandBody,
) {
  if (command === 'play') {
    // A Warren source can never play here, so saying so beats attempting it.
    if (typeof body.sourceId === 'number') {
      throw new HttpError(400, "Warren's own sources can't play on Sonos — choose a Sonos favorite")
    }

    const favoriteId = typeof body.favoriteId === 'string' ? body.favoriteId : null

    // No favorite named means resume: a Sonos speaker usually already holds
    // content — its queue, or a station someone started in the Sonos app — and
    // pressing play should continue that rather than replace it. Loading a
    // favorite unasked would override what the room was already set up to play.
    if (!favoriteId) {
      const resumed = await sonosRuntime.command(targetId, 'play')
      if (!resumed.ok) {
        throw new HttpError(502, `${resumed.error}. Choose a Sonos favorite to start something new.`)
      }
      return Response.json(await buildMusicView(db))
    }

    const result = await sonosRuntime.play(targetId, favoriteId)
    if (!result.ok) throw new HttpError(502, result.error)
    return Response.json(await buildMusicView(db))
  }

  if (command === 'volume') {
    const volume = typeof body.volume === 'number' ? body.volume : null
    if (volume === null) throw new HttpError(400, 'volume needs a value')
    const result = await sonosRuntime.volume(targetId, volume)
    if (!result.ok) throw new HttpError(502, result.error)
    return Response.json(await buildMusicView(db))
  }

  // Seeking is not offered on Sonos: a control that is known not to work is
  // absent rather than present-and-broken.
  if (!TRANSPORT.has(command as TransportCommand)) {
    throw new HttpError(400, `unknown command "${command}" for a Sonos target`)
  }

  const result = await sonosRuntime.command(targetId, command as TransportCommand)
  if (!result.ok) throw new HttpError(502, result.error)
  return Response.json(await buildMusicView(db))
}

async function handleCast(
  db: ReturnType<typeof getDb>,
  targetId: string,
  command: string,
  body: CommandBody,
) {
  let sourceId = typeof body.sourceId === 'number' ? body.sourceId : null
  if (command === 'play' && sourceId === null) {
    sourceId = listSources(db).find(s => s.isDefault)?.id ?? null
  }

  if (command === 'play') {
    if (sourceId === null) throw new HttpError(400, 'no source to play')
    const source = getSource(db, sourceId)
    if (!source) throw new HttpError(404, 'source not found')

    const result = await castRuntime.play({
      targetId,
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
          music: await buildMusicView(db),
        },
        { status: 502 },
      )
    }
    return Response.json(await buildMusicView(db))
  }

  if (command === 'seek') {
    const positionMs = typeof body.positionMs === 'number' ? body.positionMs : null
    if (positionMs === null) throw new HttpError(400, 'seek needs positionMs')
    const result = await castRuntime.seek(positionMs)
    if (!result.ok) throw new HttpError(502, result.error)
    return Response.json(await buildMusicView(db))
  }

  if (command === 'volume') {
    const volume = typeof body.volume === 'number' ? body.volume : null
    if (volume === null) throw new HttpError(400, 'volume needs a value')
    const result = await castRuntime.setVolume(volume)
    if (!result.ok) throw new HttpError(502, result.error)
    return Response.json(await buildMusicView(db))
  }

  if (!TRANSPORT.has(command as TransportCommand)) {
    throw new HttpError(400, `unknown command "${command}"`)
  }

  const result = await castRuntime.transport(command as TransportCommand)
  if (!result.ok) throw new HttpError(502, result.error)
  return Response.json(await buildMusicView(db))
}
