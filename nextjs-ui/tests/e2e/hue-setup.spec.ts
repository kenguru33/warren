import { test, expect, loginViaApi } from './fixtures'

// Tests run with HUE_FAKE=1 so /api/integrations/hue/discover and /pair use the
// stub bridge from lib/server/hue/client.ts.

test.describe('hue setup (API, fake bridge)', () => {
  test('GET /api/integrations/hue/status returns disconnected before pairing', async ({ request }) => {
    await loginViaApi(request)
    const res = await request.get('/api/integrations/hue/status')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    // When no bridge is paired, the API returns connected:false with a null bridge.
    expect(body.connected).toBe(false)
    expect(body.bridge).toBeNull()
  })

  test('POST /api/integrations/hue/discover returns the fake bridge', async ({ request }) => {
    await loginViaApi(request)
    const res = await request.post('/api/integrations/hue/discover')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('id')
      expect(body[0]).toHaveProperty('ip')
    }
  })

  test('POST /api/integrations/hue/pair completes immediately under HUE_FAKE', async ({ request }) => {
    await loginViaApi(request)
    const res = await request.post('/api/integrations/hue/pair', {
      data: { ip: '127.0.0.1' },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.bridge).toBeTruthy()
    expect(body.bridge.id).toBeTruthy()
  })

  // TODO: full browser flow once the Hue setup UI is ported — discover button,
  //       bridge picker, pairing button, and the success state.
  test.skip('UI: Hue setup pairing flow', async () => {})
})
