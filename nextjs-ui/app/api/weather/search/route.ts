import type { NextRequest } from 'next/server'
import { httpErrorResponse, HttpError } from '@/lib/server/errors'
import { searchPlaces, labelFor } from '@/lib/server/weather/geocode'

/**
 * Place-name search, proxied through the server.
 *
 * Not called from the browser directly: going through Warren means the outgoing
 * request carries our identification, and a wall panel left on a setup screen
 * cannot become a direct consumer of someone else's API.
 */
export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get('q') ?? ''
    const language = req.nextUrl.searchParams.get('lang') ?? 'en'
    if (query.length > 80) throw new HttpError(400, 'search term is too long')

    const outcome = await searchPlaces(query, language)
    if (!outcome.ok) throw new HttpError(502, outcome.error)

    return Response.json(outcome.results.map(result => ({
      ...result,
      label: labelFor(result),
    })))
  } catch (err) {
    return httpErrorResponse(err)
  }
}
