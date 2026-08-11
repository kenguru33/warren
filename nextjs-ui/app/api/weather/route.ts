import type { NextRequest } from 'next/server'
import { httpErrorResponse, HttpError } from '@/lib/server/errors'
import {
  buildWeatherView, setLocation, clearLocation, weatherRuntime,
} from '@/lib/server/weather/runtime'
import { truncateCoordinate } from '@/lib/server/weather/client'

/**
 * The dashboard's weather view, served from the server-side cache.
 *
 * A client render never triggers an upstream request — the runtime owns
 * fetching, so several dashboards open at once produce no more MET traffic
 * than one.
 */
export async function GET() {
  try {
    return Response.json(buildWeatherView())
  } catch (err) {
    return httpErrorResponse(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    let body: { latitude?: unknown; longitude?: unknown; label?: unknown } = {}
    try { body = (await req.json()) ?? {} } catch { /* validated below */ }

    const latitude = Number(body.latitude)
    const longitude = Number(body.longitude)

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new HttpError(400, 'latitude must be a number between -90 and 90')
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new HttpError(400, 'longitude must be a number between -180 and 180')
    }

    const label = typeof body.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, 60)
      : null

    // Truncated on the way in, not just at request time: MET requires at most
    // four decimals, and storing more would invite a future caller to send it.
    setLocation(truncateCoordinate(latitude), truncateCoordinate(longitude), label)

    // Fetch straight away so the card is populated rather than blank until the
    // next tick. A location change is one of the two sanctioned reasons to
    // bypass the Expires contract.
    await weatherRuntime.refreshNow()

    return Response.json(buildWeatherView())
  } catch (err) {
    return httpErrorResponse(err)
  }
}

export async function DELETE() {
  try {
    clearLocation()
    return Response.json({ ok: true })
  } catch (err) {
    return httpErrorResponse(err)
  }
}
