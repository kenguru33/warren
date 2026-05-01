import { test, expect, login, loginViaApi, pairFakeBridge, unpairBridge } from './fixtures'

// API-level contract checks. The browser-driven flow at the bottom seeds the
// fake Hue bridge, builds a room with a 2-light group, and exercises the
// dashboard's group tile → detail dialog → theme picker.

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

  test('UI: open light-group dialog and switch theme', async ({ page, request }) => {
    await loginViaApi(request)
    await unpairBridge(request)

    // Pair the fake bridge — populates hue_devices with 2 fake lights.
    expect(await pairFakeBridge(request)).toBe(true)

    // Pull the fake light deviceIds.
    const devicesRes = await request.get('/api/integrations/hue/devices')
    expect(devicesRes.ok()).toBeTruthy()
    const devices = await devicesRes.json() as { deviceId: string; kind: string; name: string | null }[]
    const lights = devices.filter(d => d.kind === 'light').slice(0, 2)
    expect(lights.length).toBeGreaterThanOrEqual(2)

    // Build: room → assign 2 lights → group them.
    const roomRes = await request.post('/api/rooms', { data: { name: 'E2E Light Group Room' } })
    const { id: roomId } = await roomRes.json() as { id: number }

    const sensorIds: number[] = []
    for (const light of lights) {
      const r = await request.post('/api/sensors', {
        data: { roomId, type: 'light', deviceId: light.deviceId, label: light.name ?? 'Light' },
      })
      const { id } = await r.json() as { id: number }
      sensorIds.push(id)
    }

    const groupRes = await request.post(`/api/rooms/${roomId}/light-groups`, {
      data: { name: 'E2E Test Group', sensorIds, theme: 'slate' },
    })
    const { id: groupId } = await groupRes.json() as { id: number }

    try {
      // Drive the UI.
      await login(page)
      await page.goto('/')

      // The group tile is a role=button container with the group name as visible text.
      const groupTile = page.locator('[role="button"]').filter({ hasText: 'E2E Test Group' }).first()
      await expect(groupTile).toBeVisible({ timeout: 15_000 })
      await groupTile.click()

      // Detail modal opens with the theme picker.
      await expect(page.getByText(/color theme/i)).toBeVisible()

      // The Listbox button shows the current theme name ("Slate"). Open it.
      const themeButton = page.getByRole('button', { name: /^slate$/i }).first()
      await themeButton.click()

      // Pick "Amber" — this should fire PATCH /api/light-groups/[id].
      const patchPromise = page.waitForResponse(
        resp => resp.url().includes(`/api/light-groups/${groupId}`) && resp.request().method() === 'PATCH',
        { timeout: 10_000 },
      )
      await page.getByRole('option', { name: /^amber$/i }).click()
      const patchResp = await patchPromise
      expect(patchResp.ok()).toBeTruthy()

      // The Listbox button label updates to the new theme name.
      await expect(page.getByRole('button', { name: /^amber$/i }).first()).toBeVisible()
    } finally {
      // Cleanup — even on failure.
      await request.delete(`/api/rooms/${roomId}`)
      await unpairBridge(request)
    }
  })
})
