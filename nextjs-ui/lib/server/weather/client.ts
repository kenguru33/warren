// The MET Norway (Yr) boundary.
//
// This is the only place MET's terms of service are enforced, and they are
// conditions of use rather than paperwork — a client that ignores them gets
// blocked, and it fails invisibly until it does. Three obligations live here:
//
//   1. Every request carries an identifying User-Agent naming the application
//      and a contact point. MET blocks generic or missing identification.
//   2. Coordinates are truncated to four decimals. Unrounded coordinates defeat
//      MET's caching and are treated as abuse.
//   3. Conditional requests: the previous Last-Modified goes back as
//      If-Modified-Since, and 304 is a success that keeps the cached forecast.
//
// The fourth obligation — honouring Expires rather than polling — belongs to
// the runtime, because it is about *when* to call this, not how.
//
// Data is licensed NLOD 2.0 / CC BY 4.0; attribution to MET Norway is rendered
// in the weather card.

export const WEATHER_FAKE = process.env.WARREN_WEATHER_FAKE === '1'

const FORECAST_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact'

/**
 * MET wants a contact point they can reach. The project URL is public and
 * stable; a fork should override it, because sending someone else's contact
 * point is worse than sending none.
 */
const CONTACT = process.env.WARREN_WEATHER_CONTACT?.trim()
  || 'https://github.com/kenguru33/warren'
const USER_AGENT = `Warren/1.0 (+${CONTACT})`

/** Used only when MET omits Expires, which it normally does not. */
const FALLBACK_TTL_MS = 30 * 60_000

export type WeatherFetch =
  | { ok: true; notModified: true }
  | { ok: true; notModified: false; payload: string; expiresAt: number; lastModified: string | null }
  | { ok: false; error: string }

/** MET requires at most four decimals; more is treated as cache-busting. */
export function truncateCoordinate(value: number): number {
  return Math.trunc(value * 10_000) / 10_000
}

function parseExpires(header: string | null): number {
  if (header) {
    const parsed = Date.parse(header)
    if (!Number.isNaN(parsed)) return parsed
  }
  return Date.now() + FALLBACK_TTL_MS
}

export async function fetchForecast(
  latitude: number,
  longitude: number,
  lastModified: string | null,
): Promise<WeatherFetch> {
  if (WEATHER_FAKE) return fakeFetch(lastModified)

  const lat = truncateCoordinate(latitude)
  const lon = truncateCoordinate(longitude)

  try {
    const res = await fetch(`${FORECAST_URL}?lat=${lat}&lon=${lon}`, {
      headers: {
        'user-agent': USER_AGENT,
        // A cached forecast that has not changed costs MET almost nothing to
        // answer, which is the point of asking conditionally.
        ...(lastModified ? { 'if-modified-since': lastModified } : {}),
      },
      // Warren does its own caching in the database; letting fetch cache too
      // would hide the Expires contract behind a second, invisible one.
      cache: 'no-store',
    })

    if (res.status === 304) return { ok: true, notModified: true }

    if (res.status === 403) {
      // The documented answer to unacceptable identification. Saying so beats
      // a generic failure, because the fix is a configuration change.
      return { ok: false, error: 'MET rejected the request — check the User-Agent contact point' }
    }

    if (res.status === 429) {
      return { ok: false, error: 'MET is rate-limiting — the forecast will retry later' }
    }

    if (!res.ok) return { ok: false, error: `MET request failed (${res.status})` }

    return {
      ok: true,
      notModified: false,
      payload: await res.text(),
      expiresAt: parseExpires(res.headers.get('expires')),
      lastModified: res.headers.get('last-modified'),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'MET request failed' }
  }
}

// ---------------------------------------------------------------------------
// Fake — WARREN_WEATHER_FAKE. Never touches the network.
//
// Models the states that matter, not just the happy path: a fresh forecast, a
// 304, and an upstream failure. The Sonos work shipped a broken feature through
// a green suite because its fake could not reach the state the device was in.
// ---------------------------------------------------------------------------

interface FakeState { mode: 'fresh' | 'not-modified' | 'error' }

declare global {
  var __warren_weather_fake: FakeState | undefined
}

export function fakeState(): FakeState {
  if (!globalThis.__warren_weather_fake) globalThis.__warren_weather_fake = { mode: 'fresh' }
  return globalThis.__warren_weather_fake
}

function fakeFetch(lastModified: string | null): WeatherFetch {
  const state = fakeState()
  if (state.mode === 'error') return { ok: false, error: 'Fake MET failure' }
  if (state.mode === 'not-modified' && lastModified) return { ok: true, notModified: true }

  return {
    ok: true,
    notModified: false,
    payload: JSON.stringify(buildFakePayload()),
    expiresAt: Date.now() + 30 * 60_000,
    lastModified: new Date().toUTCString(),
  }
}

/** Shaped exactly like a compact Locationforecast response. */
function buildFakePayload() {
  const start = Date.now()
  const symbols = ['clearsky_day', 'partlycloudy_day', 'rain', 'cloudy', 'snow', 'fair_night']
  const timeseries = Array.from({ length: 72 }, (_, i) => {
    const time = new Date(start + i * 3_600_000).toISOString()
    const symbol = symbols[i % symbols.length]
    return {
      time,
      data: {
        instant: {
          details: {
            air_temperature: 10 + (i % 12) - 4,
            wind_speed: 3 + (i % 5),
            wind_from_direction: (i * 17) % 360,
            relative_humidity: 60 + (i % 20),
          },
        },
        next_1_hours: { summary: { symbol_code: symbol }, details: { precipitation_amount: i % 4 === 0 ? 0.4 : 0 } },
        next_6_hours: { summary: { symbol_code: symbol }, details: { precipitation_amount: i % 4 === 0 ? 1.2 : 0 } },
      },
    }
  })
  return { properties: { timeseries } }
}
