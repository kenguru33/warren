// Device-API contract tests — verify that ESP32-facing endpoints work without a
// browser session, that the announce → config-fetch → reading-post round trip
// stays wire-compatible with existing firmware, and that the auth allowlist
// still covers them.

import { test, expect } from './fixtures'

const DEVICE_ID = `e2e-device-${Date.now()}`

test.describe('device API (no session)', () => {
  test('POST /api/sensors/announce accepts a camera announcement', async ({ request }) => {
    const res = await request.post('/api/sensors/announce', {
      data: {
        deviceId: DEVICE_ID,
        type: 'camera',
        streamUrl: `http://${DEVICE_ID}.local/stream.mjpg`,
        snapshotUrl: `http://${DEVICE_ID}.local/snapshot.jpg`,
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  test('GET /api/sensors/config/{deviceId} returns defaults for an unknown device', async ({ request }) => {
    const res = await request.get(`/api/sensors/config/${DEVICE_ID}-temp`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.deviceId).toBe(`${DEVICE_ID}-temp`)
    expect(body).toMatchObject({
      heaterOnOffset: 2,
      heaterOffOffset: 2,
      fanThreshold: 10,
      pollInterval: 5,
      configFetchInterval: 60,
    })
    expect(body.lastFetchedAt).toBeTruthy()
  })

  test('POST /api/sensors/{id}/reading rejects without a sensor record', async ({ request }) => {
    // A real sensor needs to exist (created via the dashboard), so the open
    // contract is: posting against a missing id returns 404, not 401. That
    // proves the route is reachable without a session.
    const res = await request.post('/api/sensors/999999999/reading', {
      data: { value: 21.5 },
    })
    expect(res.status()).toBe(404)
  })

  test('non-allowlisted /api routes still require a session (401)', async ({ request }) => {
    const res = await request.get('/api/sensors')
    expect(res.status()).toBe(401)
  })
})
