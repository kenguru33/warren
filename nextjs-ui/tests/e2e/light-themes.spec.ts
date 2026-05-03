import { test, expect, loginViaApi, pairFakeBridge, unpairBridge } from './fixtures'

// API-level coverage for the four white-light presets (warmLight, everyday,
// readingLight, nightlight). The fake Hue bridge in HUE_FAKE=1 mode no-ops
// `setLightState`, so these tests verify the SQLite-cached state rather than
// real bridge writes — exactly what survives reload and server restart.

const PRESETS = ['warmLight', 'everyday', 'readingLight', 'nightlight'] as const
const PRESET_BRI: Record<typeof PRESETS[number], number> = {
  warmLight: 60,
  everyday: 100,
  readingLight: 100,
  nightlight: 10,
}

test.describe('white-light presets', () => {
  test('PATCH /api/light-groups/[id] accepts each white preset', async ({ request }) => {
    await loginViaApi(request)
    for (const key of PRESETS) {
      const res = await request.patch('/api/light-groups/999999999', { data: { theme: key } })
      // Phantom group id → 404, but the validator must let the body through first.
      expect(res.status()).toBe(404)
    }
  })

  test('PATCH rejects unknown preset key (regression check)', async ({ request }) => {
    await loginViaApi(request)
    const res = await request.patch('/api/light-groups/1', { data: { theme: 'warm-amber' } })
    expect([400, 404]).toContain(res.status())
  })

  test('POST single-light state with white preset persists theme + brightness', async ({ request }) => {
    await loginViaApi(request)
    await unpairBridge(request)
    expect(await pairFakeBridge(request)).toBe(true)

    const devicesRes = await request.get('/api/integrations/hue/devices')
    const devices = await devicesRes.json() as { deviceId: string; kind: string; name: string | null }[]
    const light = devices.find(d => d.kind === 'light')
    expect(light).toBeTruthy()

    const roomRes = await request.post('/api/rooms', { data: { name: 'E2E Single Theme Room' } })
    const { id: roomId } = await roomRes.json() as { id: number }

    try {
      const r = await request.post('/api/sensors', {
        data: { roomId, type: 'light', deviceId: light!.deviceId, label: 'E2E Single Light' },
      })
      const { id: sensorId } = await r.json() as { id: number }

      // Apply each preset and assert lightTheme + lightBrightness on the sensors payload.
      for (const key of PRESETS) {
        const apply = await request.post(
          `/api/integrations/hue/lights/${encodeURIComponent(light!.deviceId)}/state`,
          { data: { on: true, theme: key } },
        )
        expect(apply.ok()).toBeTruthy()

        const sensors = await (await request.get('/api/sensors')).json() as Array<{
          id: number; lightTheme?: string | null; lightBrightness?: number | null
        }>
        const row = sensors.find(s => s.id === sensorId)
        expect(row, `sensor ${sensorId} not in /api/sensors`).toBeTruthy()
        expect(row!.lightTheme).toBe(key)

        // Brightness pin: catalog brightness percentage scaled to 0-254. Allow ±2 rounding tolerance.
        const expectedBri = Math.round((PRESET_BRI[key] / 100) * 254)
        expect(row!.lightBrightness).toBeGreaterThanOrEqual(expectedBri - 2)
        expect(row!.lightBrightness).toBeLessThanOrEqual(expectedBri + 2)
      }

      // Custom color pick clears the theme.
      const colorApply = await request.post(
        `/api/integrations/hue/lights/${encodeURIComponent(light!.deviceId)}/state`,
        { data: { on: true, color: '#ff0000' } },
      )
      expect(colorApply.ok()).toBeTruthy()

      const sensorsAfter = await (await request.get('/api/sensors')).json() as Array<{
        id: number; lightTheme?: string | null
      }>
      const rowAfter = sensorsAfter.find(s => s.id === sensorId)
      expect(rowAfter!.lightTheme ?? null).toBeNull()
    } finally {
      await request.delete(`/api/rooms/${roomId}`)
      await unpairBridge(request)
    }
  })

  test('POST group state with white preset stamps theme on every member + pins brightness', async ({ request }) => {
    await loginViaApi(request)
    await unpairBridge(request)
    expect(await pairFakeBridge(request)).toBe(true)

    const devicesRes = await request.get('/api/integrations/hue/devices')
    const devices = await devicesRes.json() as { deviceId: string; kind: string; name: string | null }[]
    const lights = devices.filter(d => d.kind === 'light').slice(0, 2)
    expect(lights.length).toBeGreaterThanOrEqual(2)

    const roomRes = await request.post('/api/rooms', { data: { name: 'E2E Group Theme Room' } })
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
        data: { name: 'E2E White Group', sensorIds, theme: 'slate' },
      })
      const { id: groupId } = await groupRes.json() as { id: number }

      // Apply readingLight via the state endpoint (override).
      const apply = await request.post(`/api/light-groups/${groupId}/state`, {
        data: { on: true, theme: 'readingLight' },
      })
      expect(apply.ok()).toBeTruthy()
      const summary = await apply.json() as { successCount: number; failureCount: number; total: number }
      expect(summary.failureCount).toBe(0)
      expect(summary.successCount).toBe(2)

      const sensors = await (await request.get('/api/sensors')).json() as Array<{
        id: number; lightTheme?: string | null; lightBrightness?: number | null
      }>
      for (const sid of sensorIds) {
        const row = sensors.find(s => s.id === sid)
        expect(row, `sensor ${sid} missing`).toBeTruthy()
        expect(row!.lightTheme).toBe('readingLight')
        // Reading Light = 100% brightness.
        expect(row!.lightBrightness).toBeGreaterThanOrEqual(252)
      }

      // Brightness-only adjust must NOT clobber the per-member theme override.
      // Manually override one light to nightlight, then send a group brightness request,
      // and verify the per-light override survives.
      const overrideTarget = lights[0]!
      const themeOverride = await request.post(
        `/api/integrations/hue/lights/${encodeURIComponent(overrideTarget.deviceId)}/state`,
        { data: { on: true, theme: 'nightlight' } },
      )
      expect(themeOverride.ok()).toBeTruthy()

      const adjust = await request.post(`/api/light-groups/${groupId}/state`, {
        data: { brightness: 50 },
      })
      expect(adjust.ok()).toBeTruthy()

      const sensorsAfter = await (await request.get('/api/sensors')).json() as Array<{
        id: number; lightTheme?: string | null
      }>
      const overriddenSensorId = sensors.find(s => s.id === sensorIds[0])!.id
      const overridden = sensorsAfter.find(s => s.id === overriddenSensorId)!
      expect(overridden.lightTheme).toBe('nightlight')
    } finally {
      await request.delete(`/api/rooms/${roomId}`)
      await unpairBridge(request)
    }
  })
})
