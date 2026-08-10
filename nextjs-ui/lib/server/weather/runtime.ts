// Weather runtime: owns the cached forecast and decides when to ask MET again.
//
// Mirrors lib/server/hue/runtime.ts — globalThis-cached state, started from
// boot.ts, timer cleared on shutdown so dev HMR does not leak.
//
// The load-bearing decision here is the difference between the *timer* cadence
// and the *request* cadence. MET's terms require honouring the Expires header
// rather than polling on a fixed interval, so the timer only wakes up to ask
// "has expires_at passed yet?" — it does not itself trigger a fetch. A fixed
// request interval is precisely what the terms forbid, and getting it wrong
// fails invisibly until MET blocks the host.
//
// Fetching happens here, once per installation, rather than per browser: a
// dashboard left open on a wall panel is exactly the client that would
// otherwise turn one household into many API consumers.

import type { WeatherView } from '@/lib/shared/types'
import { getDb } from '../db'
import { fetchForecast, WEATHER_FAKE } from './client'
import { currentFrom, hourlyFrom, dailyFrom } from './view'

/** How often to *check* whether the cached forecast has expired. */
const TICK_MS = 5 * 60_000

/** A forecast older than this is presented as stale rather than as current. */
const STALE_AFTER_MS = 3 * 60 * 60_000

interface ConfigRow {
  id: number
  latitude: number
  longitude: number
  label: string | null
  payload: string | null
  expires_at: number | null
  last_modified: string | null
  fetched_at: number | null
  last_error: string | null
}

interface RuntimeState {
  timer: NodeJS.Timeout | null
  started: boolean
  /** Guards against a slow fetch overlapping the next tick. */
  inFlight: boolean
}

declare global {
  var __warren_weather_state: RuntimeState | undefined
}

function state(): RuntimeState {
  if (!globalThis.__warren_weather_state) {
    globalThis.__warren_weather_state = { timer: null, started: false, inFlight: false }
  }
  return globalThis.__warren_weather_state
}

export function getConfig(): ConfigRow | null {
  return getDb().prepare('SELECT * FROM weather_config WHERE id = 1')
    .get() as ConfigRow | undefined ?? null
}

export function setLocation(latitude: number, longitude: number, label: string | null) {
  getDb().prepare(`
    INSERT INTO weather_config (id, latitude, longitude, label, updated_at)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      label = excluded.label,
      updated_at = excluded.updated_at,
      -- A new location invalidates everything cached for the old one.
      payload = NULL, expires_at = NULL, last_modified = NULL,
      fetched_at = NULL, last_error = NULL
  `).run(latitude, longitude, label, Date.now())
}

export function clearLocation() {
  getDb().prepare('DELETE FROM weather_config').run()
}

/**
 * Fetch if the cached forecast has expired, or if forced.
 *
 * `force` is the one sanctioned way past the Expires contract, and exists for
 * an explicit user refresh and for a location change.
 */
async function refresh(force = false): Promise<void> {
  const s = state()
  if (s.inFlight) return

  const config = getConfig()
  if (!config) return

  const expired = !config.expires_at || config.expires_at <= Date.now()
  if (!force && !expired) return

  s.inFlight = true
  try {
    const result = await fetchForecast(config.latitude, config.longitude, config.last_modified)
    const db = getDb()

    if (!result.ok) {
      // Keep the last good payload: a stale forecast is more useful than none,
      // and the error is recorded so the card can say what happened.
      db.prepare('UPDATE weather_config SET last_error = ? WHERE id = 1').run(result.error)
      return
    }

    if (result.notModified) {
      // 304 is a success. The forecast has not changed, so only the freshness
      // bookkeeping moves — treating it as a failure would discard good data.
      db.prepare('UPDATE weather_config SET fetched_at = ?, last_error = NULL WHERE id = 1')
        .run(Date.now())
      return
    }

    db.prepare(`
      UPDATE weather_config
      SET payload = ?, expires_at = ?, last_modified = ?, fetched_at = ?, last_error = NULL
      WHERE id = 1
    `).run(result.payload, result.expiresAt, result.lastModified, Date.now())
  } finally {
    s.inFlight = false
  }
}

export function buildWeatherView(): WeatherView {
  const config = getConfig()

  if (!config) {
    // Not configured is a normal state, not an error: weather is invisible
    // until a location is set, the same way the music player is.
    return {
      configured: false, location: null, current: null,
      hourly: [], daily: [], updatedAt: null, stale: false, error: null,
    }
  }

  const location = {
    latitude: config.latitude,
    longitude: config.longitude,
    label: config.label,
  }

  if (!config.payload) {
    return {
      configured: true, location, current: null, hourly: [], daily: [],
      updatedAt: null, stale: false, error: config.last_error,
    }
  }

  return {
    configured: true,
    location,
    current: currentFrom(config.payload),
    hourly: hourlyFrom(config.payload),
    daily: dailyFrom(config.payload),
    updatedAt: config.fetched_at,
    // Explicit rather than left for the client to infer from updatedAt.
    stale: !!config.fetched_at && Date.now() - config.fetched_at > STALE_AFTER_MS,
    error: config.last_error,
  }
}

export const weatherRuntime = {
  start() {
    const s = state()
    if (s.started) return
    s.started = true

    void refresh().catch(err => console.error('[weather] refresh failed:', err))
    s.timer = setInterval(() => {
      // Only fetches when expires_at has passed — see the note at the top.
      void refresh().catch(err => console.error('[weather] refresh failed:', err))
    }, TICK_MS)

    console.log(`[weather] runtime started${WEATHER_FAKE ? ' (fake)' : ''}`)
  },

  stop() {
    const s = state()
    if (s.timer) clearInterval(s.timer)
    s.timer = null
    s.started = false
  },

  refreshNow: () => refresh(true),
}
