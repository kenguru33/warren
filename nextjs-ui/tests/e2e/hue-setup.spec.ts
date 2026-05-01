import { test, expect, login, loginViaApi, unpairBridge } from './fixtures'

// Tests run with HUE_FAKE=1 so /api/integrations/hue/discover and /pair use the
// stub bridge from lib/server/hue/client.ts.

test.describe('hue setup (API, fake bridge)', () => {
  test('GET /api/integrations/hue/status returns disconnected before pairing', async ({ request }) => {
    await loginViaApi(request)
    await unpairBridge(request)
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
    await unpairBridge(request)
    const res = await request.post('/api/integrations/hue/pair', {
      data: { ip: '127.0.0.1' },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.bridge).toBeTruthy()
    expect(body.bridge.id).toBeTruthy()
    await unpairBridge(request)
  })

  test('UI: Hue setup pairing flow', async ({ page, request }) => {
    await loginViaApi(request)
    await unpairBridge(request)

    await login(page)
    await page.goto('/integrations/hue')

    // Empty-state CTA is visible when no bridge is paired.
    const connectButton = page.getByRole('button', { name: /connect hue bridge/i })
    await expect(connectButton).toBeVisible()
    await connectButton.click()

    // Pairing modal opens, auto-discover runs. The fake bridge appears as a
    // selectable button with its IP.
    const bridgeButton = page.getByRole('button', { name: /127\.0\.0\.1/i })
    await expect(bridgeButton).toBeVisible({ timeout: 15_000 })

    // Click triggers POST /api/integrations/hue/pair. HUE_FAKE returns the
    // app key immediately so the modal jumps to the success state.
    await bridgeButton.click()
    await expect(page.getByText(/bridge paired successfully/i)).toBeVisible({ timeout: 35_000 })

    // Modal closes 600ms after success; the page reloads status and shows the
    // connected bridge name.
    await expect(page.getByText(/fake hue/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /sync now/i })).toBeVisible()

    // Cleanup
    await unpairBridge(request)
  })
})
