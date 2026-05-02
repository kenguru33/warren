import { test, expect, login, loginViaApi, pairFakeBridge, unpairBridge } from './fixtures'

// Confirms the room-assignment guard + confirmation dialogs on the lights page,
// plus the new DELETE /api/light-groups/[id]/members/[sensorId] endpoint.

test.describe('light-group member removal API', () => {
  test('DELETE /api/light-groups/[id]/members/[sensorId] removes membership', async ({ request }) => {
    await loginViaApi(request)
    await unpairBridge(request)
    expect(await pairFakeBridge(request)).toBe(true)

    const devicesRes = await request.get('/api/integrations/hue/devices')
    const devices = await devicesRes.json() as { deviceId: string; kind: string; name: string | null }[]
    const lights = devices.filter(d => d.kind === 'light').slice(0, 2)
    expect(lights.length).toBeGreaterThanOrEqual(2)

    const roomRes = await request.post('/api/rooms', { data: { name: 'E2E Member-Removal Room' } })
    const { id: roomId } = await roomRes.json() as { id: number }

    try {
      const sensorIds: number[] = []
      for (const light of lights) {
        const r = await request.post('/api/sensors', {
          data: { roomId, type: 'light', deviceId: light.deviceId, label: light.name ?? 'Light' },
        })
        const { id } = await r.json() as { id: number }
        sensorIds.push(id)
      }

      const groupRes = await request.post(`/api/rooms/${roomId}/light-groups`, {
        data: { name: 'E2E Removal Group', sensorIds, theme: 'slate' },
      })
      const { id: groupId } = await groupRes.json() as { id: number }

      // Remove first member — group should still exist with one member.
      let res = await request.delete(`/api/light-groups/${groupId}/members/${sensorIds[0]}`)
      expect(res.ok()).toBeTruthy()

      const sensorsAfterFirst = await (await request.get('/api/sensors')).json() as { id: number; groupId: number | null }[]
      const first = sensorsAfterFirst.find(s => s.id === sensorIds[0])
      const second = sensorsAfterFirst.find(s => s.id === sensorIds[1])
      expect(first?.groupId).toBeNull()
      expect(second?.groupId).toBe(groupId)

      // Remove the last member — group should be pruned.
      res = await request.delete(`/api/light-groups/${groupId}/members/${sensorIds[1]}`)
      expect(res.ok()).toBeTruthy()

      const sensorsAfterSecond = await (await request.get('/api/sensors')).json() as { id: number; groupId: number | null }[]
      const secondAfter = sensorsAfterSecond.find(s => s.id === sensorIds[1])
      expect(secondAfter?.groupId).toBeNull()

      // Group itself is gone — a follow-up delete returns 404.
      res = await request.delete(`/api/light-groups/${groupId}/members/${sensorIds[1]}`)
      expect(res.status()).toBe(404)
    } finally {
      await request.delete(`/api/rooms/${roomId}`)
      await unpairBridge(request)
    }
  })

  test('DELETE returns 404 for unknown group or sensor', async ({ request }) => {
    await loginViaApi(request)
    const a = await request.delete('/api/light-groups/999999/members/1')
    expect(a.status()).toBe(404)
    const b = await request.delete('/api/light-groups/1/members/999999')
    expect([400, 404]).toContain(b.status())
  })
})

test.describe('lights page room-assignment dialogs', () => {
  test('grouped light triggers guard, then move flow after remove-from-group', async ({ page, request }) => {
    await loginViaApi(request)
    await unpairBridge(request)
    expect(await pairFakeBridge(request)).toBe(true)

    const devicesRes = await request.get('/api/integrations/hue/devices')
    const devices = await devicesRes.json() as { deviceId: string; kind: string; name: string | null }[]
    const lights = devices.filter(d => d.kind === 'light').slice(0, 2)
    expect(lights.length).toBeGreaterThanOrEqual(2)

    const roomARes = await request.post('/api/rooms', { data: { name: 'E2E Room A' } })
    const { id: roomAId } = await roomARes.json() as { id: number }
    const roomBRes = await request.post('/api/rooms', { data: { name: 'E2E Room B' } })
    const { id: roomBId } = await roomBRes.json() as { id: number }

    try {
      const sensorIds: number[] = []
      const labels: string[] = []
      for (let i = 0; i < lights.length; i++) {
        const label = `E2E Light ${i + 1}`
        const r = await request.post('/api/sensors', {
          data: { roomId: roomAId, type: 'light', deviceId: lights[i].deviceId, label },
        })
        const { id } = await r.json() as { id: number }
        sensorIds.push(id)
        labels.push(label)
      }

      const groupRes = await request.post(`/api/rooms/${roomAId}/light-groups`, {
        data: { name: 'E2E Move Group', sensorIds, theme: 'slate' },
      })
      const { id: groupId } = await groupRes.json() as { id: number }

      await login(page)
      await page.goto('/lights')

      const targetLabel = labels[0]
      const row = page.locator('li').filter({ hasText: targetLabel }).first()
      await expect(row).toBeVisible({ timeout: 15_000 })
      // Wait until SWR has merged group membership into the row data (badge appears).
      await expect(row.getByText('E2E Move Group')).toBeVisible({ timeout: 15_000 })

      // Track PATCH /api/sensors/<id> requests so we can assert no half-applied state.
      const patchUrls: string[] = []
      page.on('request', req => {
        if (req.method() === 'PATCH' && /\/api\/sensors\/\d+$/.test(new URL(req.url()).pathname)) {
          patchUrls.push(req.url())
        }
      })

      // 1. Guard dialog appears, Cancel leaves state untouched.
      await row.getByRole('button', { name: 'Light actions' }).click()
      await page.getByRole('menuitem', { name: 'E2E Room B' }).click()
      const guardHeading = page.getByRole('heading', { name: 'Light is in a group' })
      await expect(guardHeading).toBeVisible()
      await expect(page.locator('strong', { hasText: 'E2E Move Group' })).toBeVisible()
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('heading', { name: 'Light is in a group' })).toBeHidden()
      expect(patchUrls).toHaveLength(0)

      // 2. Open guard again → click Remove from group → DELETE fires.
      await row.getByRole('button', { name: 'Light actions' }).click()
      await page.getByRole('menuitem', { name: 'E2E Room B' }).click()
      await expect(page.getByRole('heading', { name: 'Light is in a group' })).toBeVisible()
      const deletePromise = page.waitForResponse(
        resp => resp.url().includes(`/api/light-groups/${groupId}/members/`) && resp.request().method() === 'DELETE',
        { timeout: 10_000 },
      )
      await page.getByRole('button', { name: 'Remove from group' }).click()
      const deleteResp = await deletePromise
      expect(deleteResp.ok()).toBeTruthy()
      await expect(page.getByRole('heading', { name: 'Light is in a group' })).toBeHidden({ timeout: 10_000 })
      // Group badge should be gone for the row.
      await expect(row.getByText('E2E Move Group')).toBeHidden({ timeout: 10_000 })
      expect(patchUrls).toHaveLength(0)

      // 3. Pick Room B again → move-confirmation dialog (NOT guard) → Cancel.
      await row.getByRole('button', { name: 'Light actions' }).click()
      await page.getByRole('menuitem', { name: 'E2E Room B' }).click()
      await expect(page.getByRole('heading', { name: 'Move light?' })).toBeVisible()
      // Dialog body emphasizes source and target rooms with <strong>.
      await expect(page.locator('strong', { hasText: 'E2E Room A' })).toBeVisible()
      await expect(page.locator('strong', { hasText: 'E2E Room B' })).toBeVisible()
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('heading', { name: 'Move light?' })).toBeHidden()
      expect(patchUrls).toHaveLength(0)

      // 4. Pick Room B → Move → PATCH fires.
      await row.getByRole('button', { name: 'Light actions' }).click()
      await page.getByRole('menuitem', { name: 'E2E Room B' }).click()
      await expect(page.getByRole('heading', { name: 'Move light?' })).toBeVisible()
      const patchPromise = page.waitForResponse(
        resp => /\/api\/sensors\/\d+$/.test(new URL(resp.url()).pathname) && resp.request().method() === 'PATCH',
        { timeout: 10_000 },
      )
      await page.getByRole('button', { name: 'Move', exact: true }).click()
      const patchResp = await patchPromise
      expect(patchResp.ok()).toBeTruthy()
      expect(patchUrls.length).toBeGreaterThanOrEqual(1)
    } finally {
      await request.delete(`/api/rooms/${roomAId}`)
      await request.delete(`/api/rooms/${roomBId}`)
      await unpairBridge(request)
    }
  })

  test('Remove from room shows confirmation; cancel does not PATCH, confirm does', async ({ page, request }) => {
    await loginViaApi(request)
    await unpairBridge(request)
    expect(await pairFakeBridge(request)).toBe(true)

    const devicesRes = await request.get('/api/integrations/hue/devices')
    const devices = await devicesRes.json() as { deviceId: string; kind: string; name: string | null }[]
    const light = devices.find(d => d.kind === 'light')
    expect(light).toBeTruthy()

    const roomRes = await request.post('/api/rooms', { data: { name: 'E2E Remove Room' } })
    const { id: roomId } = await roomRes.json() as { id: number }

    try {
      const label = 'E2E Remove Light'
      const r = await request.post('/api/sensors', {
        data: { roomId, type: 'light', deviceId: light!.deviceId, label },
      })
      const { id: sensorId } = await r.json() as { id: number }

      await login(page)
      await page.goto('/lights')

      const row = page.locator('li').filter({ hasText: label }).first()
      await expect(row).toBeVisible({ timeout: 15_000 })

      const patchUrls: string[] = []
      page.on('request', req => {
        if (req.method() === 'PATCH' && new URL(req.url()).pathname === `/api/sensors/${sensorId}`) {
          patchUrls.push(req.url())
        }
      })

      // Cancel — no PATCH.
      await row.getByRole('button', { name: 'Light actions' }).click()
      await page.getByRole('menuitem', { name: 'Remove from room' }).click()
      await expect(page.getByRole('heading', { name: 'Remove from room?' })).toBeVisible()
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('heading', { name: 'Remove from room?' })).toBeHidden()
      expect(patchUrls).toHaveLength(0)

      // Confirm — PATCH fires.
      await row.getByRole('button', { name: 'Light actions' }).click()
      await page.getByRole('menuitem', { name: 'Remove from room' }).click()
      await expect(page.getByRole('heading', { name: 'Remove from room?' })).toBeVisible()
      const patchPromise = page.waitForResponse(
        resp => new URL(resp.url()).pathname === `/api/sensors/${sensorId}` && resp.request().method() === 'PATCH',
        { timeout: 10_000 },
      )
      await page.getByRole('button', { name: 'Remove', exact: true }).click()
      const patchResp = await patchPromise
      expect(patchResp.ok()).toBeTruthy()
      expect(patchUrls).toHaveLength(1)
    } finally {
      await request.delete(`/api/rooms/${roomId}`)
      await unpairBridge(request)
    }
  })

  test('Unassigned Hue light first-time placement uses Add-to-room dialog', async ({ page, request }) => {
    await loginViaApi(request)
    await unpairBridge(request)
    expect(await pairFakeBridge(request)).toBe(true)

    const devicesRes = await request.get('/api/integrations/hue/devices')
    const devices = await devicesRes.json() as { deviceId: string; kind: string; name: string | null }[]
    const light = devices.find(d => d.kind === 'light')
    expect(light).toBeTruthy()

    const roomRes = await request.post('/api/rooms', { data: { name: 'E2E Add Room' } })
    const { id: roomId } = await roomRes.json() as { id: number }

    try {
      await login(page)
      await page.goto('/lights')

      // Find the row for the unassigned hue light by its device id (matching against label is unreliable
      // since hue name fallback shows the bridge-supplied name).
      const row = page.locator('li').filter({ hasText: light!.deviceId }).first()
      await expect(row).toBeVisible({ timeout: 15_000 })

      const postPromise = page.waitForResponse(
        resp => new URL(resp.url()).pathname === '/api/sensors' && resp.request().method() === 'POST',
        { timeout: 10_000 },
      )

      await row.getByRole('button', { name: 'Light actions' }).click()
      await page.getByRole('menuitem', { name: 'E2E Add Room' }).click()
      await expect(page.getByRole('heading', { name: 'Add light to room?' })).toBeVisible()
      // Source line in the dialog renders the unassigned origin as <strong>Unassigned</strong>.
      await expect(page.locator('strong', { hasText: 'Unassigned' })).toBeVisible()
      await page.getByRole('button', { name: 'Add to room' }).click()

      const postResp = await postPromise
      expect(postResp.ok()).toBeTruthy()
    } finally {
      await request.delete(`/api/rooms/${roomId}`)
      await unpairBridge(request)
    }
  })
})
