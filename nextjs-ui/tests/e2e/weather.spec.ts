import { test, expect, loginViaApi } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

// Runs with WARREN_WEATHER_FAKE=1 (playwright.config.ts). No test reaches
// api.met.no — MET's terms make an unattended test suite exactly the kind of
// client that gets a host blocked.

interface WeatherView {
  configured: boolean
  location: { latitude: number; longitude: number; label: string | null } | null
  current: { temperature: number | null; symbol: string | null } | null
  hourly: { time: string; temperature: number | null }[]
  daily: { date: string; high: number | null; low: number | null }[]
  updatedAt: number | null
  stale: boolean
  error: string | null
}

async function view(request: APIRequestContext): Promise<WeatherView> {
  return await (await request.get('/api/weather')).json() as WeatherView
}

test.describe('weather', () => {
  test.beforeEach(async ({ request }) => {
    await loginViaApi(request)
    await request.delete('/api/weather')
  })

  test('is unconfigured until a location is set', async ({ request }) => {
    const before = await view(request)
    expect(before.configured).toBe(false)
    expect(before.current).toBeNull()
    expect(before.daily).toEqual([])
  })

  test('setting a location populates the forecast immediately', async ({ request }) => {
    const res = await request.put('/api/weather', {
      data: { latitude: 59.9139, longitude: 10.7522, label: 'Home' },
    })
    expect(res.ok()).toBeTruthy()

    // Populated by the PUT itself, not left blank until the next tick.
    const after = await res.json() as WeatherView
    expect(after.configured).toBe(true)
    expect(after.location?.label).toBe('Home')
    expect(after.current?.temperature).not.toBeNull()
    expect(after.hourly.length).toBeGreaterThan(0)
    expect(after.daily.length).toBeGreaterThan(0)
    expect(after.updatedAt).not.toBeNull()
    expect(after.stale).toBe(false)
  })

  test('coordinates are truncated to four decimals', async ({ request }) => {
    await request.put('/api/weather', {
      data: { latitude: 59.913912345, longitude: 10.752298765 },
    })
    const after = await view(request)
    // MET requires at most four decimals; more defeats their cache and is
    // treated as abuse, so it is truncated on the way in rather than at
    // request time only.
    expect(after.location?.latitude).toBe(59.9139)
    expect(after.location?.longitude).toBe(10.7522)
  })

  test('invalid coordinates are rejected', async ({ request }) => {
    for (const data of [
      { latitude: 91, longitude: 0 },
      { latitude: -91, longitude: 0 },
      { latitude: 0, longitude: 181 },
      { latitude: 0, longitude: -181 },
      { latitude: 'north', longitude: 0 },
      { longitude: 0 },
      {},
    ]) {
      const res = await request.put('/api/weather', { data })
      expect(res.status()).toBe(400)
    }
  })

  test('the daily view carries a high and a low per day', async ({ request }) => {
    await request.put('/api/weather', { data: { latitude: 59.9139, longitude: 10.7522 } })
    const after = await view(request)

    for (const day of after.daily) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(day.high).not.toBeNull()
      expect(day.low).not.toBeNull()
      expect(day.high!).toBeGreaterThanOrEqual(day.low!)
    }
    // Capped: MET returns about ten days, which is unreadable on a wall panel.
    expect(after.daily.length).toBeLessThanOrEqual(5)
  })

  test('an explicit refresh works, and is refused with no location', async ({ request }) => {
    const refused = await request.post('/api/weather/refresh')
    expect(refused.status()).toBe(404)

    await request.put('/api/weather', { data: { latitude: 59.9139, longitude: 10.7522 } })
    const res = await request.post('/api/weather/refresh')
    expect(res.ok()).toBeTruthy()
    expect((await res.json() as WeatherView).current?.temperature).not.toBeNull()
  })

  test('clearing the location removes the forecast', async ({ request }) => {
    await request.put('/api/weather', { data: { latitude: 59.9139, longitude: 10.7522 } })
    expect((await view(request)).configured).toBe(true)

    await request.delete('/api/weather')
    const after = await view(request)
    expect(after.configured).toBe(false)
    expect(after.current).toBeNull()
  })

  test('weather is not a sensor', async ({ request }) => {
    await request.put('/api/weather', { data: { latitude: 59.9139, longitude: 10.7522 } })

    // A forecast is not a reading: it must stay out of sensor discovery and
    // the InfluxDB pipeline, the same boundary the music player observes.
    const discovered = await (await request.get('/api/sensors/discovered')).json() as unknown[]
    expect(JSON.stringify(discovered).toLowerCase()).not.toContain('weather')

    const rooms = await (await request.get('/api/rooms')).json() as Record<string, unknown>[]
    for (const room of rooms) expect(room).not.toHaveProperty('weather')
  })
})
