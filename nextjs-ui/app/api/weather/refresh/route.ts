import { httpErrorResponse, HttpError } from '@/lib/server/errors'
import { buildWeatherView, getConfig, weatherRuntime } from '@/lib/server/weather/runtime'

/**
 * Explicit refresh — the other sanctioned way past the Expires contract.
 *
 * Deliberately a POST rather than a side effect of GET, so that rendering the
 * dashboard can never become a way to hammer MET.
 */
export async function POST() {
  try {
    if (!getConfig()) throw new HttpError(404, 'set a weather location first')
    await weatherRuntime.refreshNow()
    return Response.json(buildWeatherView())
  } catch (err) {
    return httpErrorResponse(err)
  }
}
