// Place-name search, so the household can type "Lillestrøm" rather than
// looking up coordinates.
//
// MET does not geocode, so this is a second upstream service — which the spec
// originally avoided for exactly that reason. Open-Meteo's geocoding API is the
// narrowest way to add it: purpose-built for this, no account or key, and it
// returns structured name/region/country plus population, which is what makes
// "Oslo, Norway" distinguishable from "Oslo, Minnesota" in a picker.
//
// It is used *only* to turn a name into coordinates. The forecast itself stays
// with MET Norway; nothing about the weather data comes from here.
//
// Searching happens on the server rather than from the browser so the outgoing
// request carries Warren's identification and so a wall panel cannot become a
// direct consumer of someone else's API.

export const WEATHER_FAKE = process.env.WARREN_WEATHER_FAKE === '1'

const SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search'

const CONTACT = process.env.WARREN_WEATHER_CONTACT?.trim()
  || 'https://github.com/kenguru33/warren'
const USER_AGENT = `Warren/1.0 (+${CONTACT})`

/** Enough to choose from without turning the dialog into a list to scroll. */
const RESULT_LIMIT = 8

export interface GeocodeResult {
  /** Stable within a result set, for React keys and selection. */
  id: string
  name: string
  /** Region or state, when the service knows one. */
  region: string | null
  country: string | null
  latitude: number
  longitude: number
}

export type GeocodeOutcome =
  | { ok: true; results: GeocodeResult[] }
  | { ok: false; error: string }

const FAKE_RESULTS: GeocodeResult[] = [
  { id: '1', name: 'Oslo', region: 'Oslo', country: 'Norge', latitude: 59.9127, longitude: 10.7461 },
  { id: '2', name: 'Oslo', region: 'Minnesota', country: 'United States', latitude: 48.1953, longitude: -97.132 },
  { id: '3', name: 'Lillestrøm', region: 'Akershus', country: 'Norge', latitude: 59.956, longitude: 11.0492 },
]

export async function searchPlaces(query: string, language = 'en'): Promise<GeocodeOutcome> {
  const q = query.trim()
  // One or two characters match half the world and waste an upstream call.
  if (q.length < 2) return { ok: true, results: [] }

  if (WEATHER_FAKE) {
    const needle = q.toLowerCase()
    return { ok: true, results: FAKE_RESULTS.filter(r => r.name.toLowerCase().startsWith(needle)) }
  }

  const params = new URLSearchParams({
    name: q,
    count: String(RESULT_LIMIT),
    language,
    format: 'json',
  })

  try {
    const res = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { 'user-agent': USER_AGENT },
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, error: `Place search failed (${res.status})` }

    const body = await res.json() as { results?: unknown[] }
    // No match is an empty list, not an error — the user is still typing.
    const raw = Array.isArray(body.results) ? body.results : []

    return {
      ok: true,
      results: raw.flatMap(entry => {
        const r = entry as {
          id?: number; name?: string; admin1?: string; country?: string
          latitude?: number; longitude?: number
        }
        if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number' || !r.name) return []
        return [{
          id: String(r.id ?? `${r.latitude},${r.longitude}`),
          name: r.name,
          region: r.admin1 ?? null,
          country: r.country ?? null,
          latitude: r.latitude,
          longitude: r.longitude,
        }]
      }),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Place search failed' }
  }
}

/** How a chosen place is labelled once stored, e.g. "Oslo, Norge". */
export function labelFor(result: GeocodeResult): string {
  return [result.name, result.country].filter(Boolean).join(', ')
}
