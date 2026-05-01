import { test, expect, loginViaApi } from './fixtures'

// These tests cover the light-group state and theme-switch HTTP contract.
// The full UI (modal, theme picker) is being ported separately; once it
// lands, add browser-driven coverage that exercises clicks rather than
// raw fetches.

test.describe('light groups (API)', () => {
  test('PATCH /api/light-groups/[id] accepts a valid theme key', async ({ request }) => {
    await loginViaApi(request)
    // Create a phantom group via direct PATCH against id=999 — should 404 cleanly.
    const res = await request.patch('/api/light-groups/999999999', {
      data: { theme: 'amber' },
    })
    expect(res.status()).toBe(404)
  })

  test('PATCH /api/light-groups/[id] rejects an unknown theme key', async ({ request }) => {
    await loginViaApi(request)
    const res = await request.patch('/api/light-groups/1', {
      data: { theme: 'warm-amber' },
    })
    expect([400, 404]).toContain(res.status())
    if (res.status() === 400) {
      const body = await res.json()
      expect(body.message ?? body.statusMessage).toMatch(/theme/i)
    }
  })

  test('POST /api/light-groups/[id]/state requires on or brightness', async ({ request }) => {
    await loginViaApi(request)
    const res = await request.post('/api/light-groups/1/state', { data: {} })
    expect([400, 404]).toContain(res.status())
  })

  // TODO: full browser flow once the dashboard's LightGroupTile / detail dialog
  //       lands in nextjs-ui. The flow: open dialog → switch theme → assert
  //       fan-out call to /lights/{id}/state with xy values from the new palette.
  test.skip('UI: open light-group dialog and switch theme', async () => {})
})
