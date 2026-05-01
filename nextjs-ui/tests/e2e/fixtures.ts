import { test as base, type Page, type APIRequestContext } from '@playwright/test'

const TEST_USERNAME = process.env.WARREN_AUTH_USERNAME ?? 'e2e'
const TEST_PASSWORD = process.env.WARREN_AUTH_PASSWORD ?? 'e2e-test-password'

export async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#username', TEST_USERNAME)
  await page.fill('#password', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/')
}

export async function loginViaApi(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', {
    data: { username: TEST_USERNAME, password: TEST_PASSWORD },
  })
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`)
}

// Seed-and-pair the fake Hue bridge (HUE_FAKE=1 in playwright.config.ts).
// Returns true if a bridge is now connected with at least `minLights` lights
// synced; false otherwise.
//
// `pair` triggers `hueRuntime.restart()` which kicks off the first sync
// asynchronously. Poll `/api/integrations/hue/devices` until the expected
// number of light rows appears so the calling test can rely on hue_devices
// being fully seeded. A second `/sync` request is fired between polls to
// nudge the runtime if its first cycle hasn't started yet.
export async function pairFakeBridge(request: APIRequestContext, minLights = 2): Promise<boolean> {
  const res = await request.post('/api/integrations/hue/pair', { data: { ip: '127.0.0.1' } })
  if (!res.ok()) return false
  const deadline = Date.now() + 15_000
  let prodCount = 0
  while (Date.now() < deadline) {
    const devicesRes = await request.get('/api/integrations/hue/devices')
    if (devicesRes.ok()) {
      const devices = await devicesRes.json() as { kind: string }[]
      const lights = devices.filter(d => d.kind === 'light').length
      if (lights >= minLights) return true
    }
    // Every fourth poll, prod the runtime to start (or restart) its sync cycle —
    // covers the case where a stop()/start() race left s.running stuck.
    if (prodCount++ % 4 === 0) {
      await request.post('/api/integrations/hue/sync')
    }
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

export async function unpairBridge(request: APIRequestContext) {
  await request.delete('/api/integrations/hue')
}

export const test = base
export { expect } from '@playwright/test'
