// Derives the dashboard view from a cached MET payload.
//
// Kept separate from client.ts so presentation can change without touching the
// caching contract, and separate from runtime.ts so it stays a pure function of
// the stored payload — which makes it testable without a fetch or a database.

import type {
  WeatherCurrent, WeatherDay, WeatherHour, WeatherSymbol,
} from '@/lib/shared/types'

/** Hours shown in the strip; more than a day of them is not glanceable. */
const HOURLY_COUNT = 12
/** Days shown; MET returns about ten, which is unreadable on a wall panel. */
const DAILY_COUNT = 5

interface MetEntry {
  time?: string
  data?: {
    instant?: { details?: Record<string, number> }
    next_1_hours?: { summary?: { symbol_code?: string }; details?: Record<string, number> }
    next_6_hours?: { summary?: { symbol_code?: string }; details?: Record<string, number> }
  }
}

function timeseriesOf(payload: string): MetEntry[] {
  try {
    const parsed = JSON.parse(payload) as { properties?: { timeseries?: MetEntry[] } }
    return parsed.properties?.timeseries ?? []
  } catch {
    return []
  }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The 1-hour block is more precise; the 6-hour one is the fallback further out. */
function symbolOf(entry: MetEntry): WeatherSymbol | null {
  return entry.data?.next_1_hours?.summary?.symbol_code
    ?? entry.data?.next_6_hours?.summary?.symbol_code
    ?? null
}

function precipitationOf(entry: MetEntry): number | null {
  return num(entry.data?.next_1_hours?.details?.precipitation_amount)
    ?? num(entry.data?.next_6_hours?.details?.precipitation_amount)
}

export function currentFrom(payload: string): WeatherCurrent | null {
  const first = timeseriesOf(payload)[0]
  if (!first) return null

  const details = first.data?.instant?.details ?? {}
  return {
    temperature: num(details.air_temperature),
    symbol: symbolOf(first),
    windSpeed: num(details.wind_speed),
    windFromDirection: num(details.wind_from_direction),
    humidity: num(details.relative_humidity),
    precipitation: precipitationOf(first),
  }
}

export function hourlyFrom(payload: string): WeatherHour[] {
  return timeseriesOf(payload)
    .filter(entry => !!entry.time)
    .slice(0, HOURLY_COUNT)
    .map(entry => ({
      time: entry.time!,
      temperature: num(entry.data?.instant?.details?.air_temperature),
      symbol: symbolOf(entry),
      precipitation: precipitationOf(entry),
    }))
}

/**
 * Daily highs and lows, grouped by **local** calendar day.
 *
 * MET returns UTC instants and 1/6-hour blocks, never days, so this is derived.
 * Grouping by UTC would put highs and lows on the wrong day for anywhere far
 * enough from Greenwich — which is the whole point of a local dashboard.
 */
export function dailyFrom(payload: string): WeatherDay[] {
  const byDate = new Map<string, { temps: number[]; symbols: string[]; precipitation: number }>()

  for (const entry of timeseriesOf(payload)) {
    if (!entry.time) continue
    const when = new Date(entry.time)
    if (Number.isNaN(when.getTime())) continue

    // Local date parts, not toISOString(), which would be UTC again.
    const date = [
      when.getFullYear(),
      String(when.getMonth() + 1).padStart(2, '0'),
      String(when.getDate()).padStart(2, '0'),
    ].join('-')

    const bucket = byDate.get(date) ?? { temps: [], symbols: [], precipitation: 0 }
    const temperature = num(entry.data?.instant?.details?.air_temperature)
    if (temperature !== null) bucket.temps.push(temperature)

    // Midday best represents a day at a glance; a night symbol would misread.
    const hour = when.getHours()
    const symbol = symbolOf(entry)
    if (symbol && hour >= 11 && hour <= 15) bucket.symbols.push(symbol)

    bucket.precipitation += precipitationOf(entry) ?? 0
    byDate.set(date, bucket)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, DAILY_COUNT)
    .map(([date, bucket]) => ({
      date,
      symbol: bucket.symbols[0] ?? null,
      high: bucket.temps.length ? Math.max(...bucket.temps) : null,
      low: bucket.temps.length ? Math.min(...bucket.temps) : null,
      precipitation: Math.round(bucket.precipitation * 10) / 10,
    }))
}
