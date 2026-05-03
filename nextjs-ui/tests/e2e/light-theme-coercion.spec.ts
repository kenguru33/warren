import { test, expect, loginViaApi, pairFakeBridge, unpairBridge } from './fixtures'

// Verifies that color themes persisted on contexts that no longer offer them
// (single lights; groups with no color-capable members) are coerced to
// 'everyday' on first read. Idempotent: subsequent reads return 'everyday'.
//
// Fake bridge layout: 1 color light + 2 dimmable lights (see lib/server/hue/client.ts).
// Color theme on a single dimmable → coerced. White-only 2-dimmable group with a
// color theme → coerced. Mixed group (color + dimmable) keeps its color theme.

interface HueDeviceLite {
  deviceId: string
  kind: string
  name: string | null
  capabilities: { color?: boolean; colorTemp?: boolean; brightness?: boolean } | null
}

async function getLights(request: import('@playwright/test').APIRequestContext): Promise<HueDeviceLite[]> {
  const res = await request.get('/api/integrations/hue/devices')
  const devices = await res.json() as HueDeviceLite[]
  return devices.filter(d => d.kind === 'light')
}

function pickColorLight(lights: HueDeviceLite[]): HueDeviceLite | undefined {
  return lights.find(l => l.capabilities?.color === true)
}

function pickDimmables(lights: HueDeviceLite[], n: number): HueDeviceLite[] {
  return lights.filter(l => l.capabilities?.color !== true).slice(0, n)
}

test.describe('color-theme coercion', () => {
  test('single light with persisted color theme is coerced to everyday on next read', async ({ request }) => {
    await loginViaApi(request)
    await unpairBridge(request)
    expect(await pairFakeBridge(request, 3)).toBe(true)

    const lights = await getLights(request)
    const dimmables = pickDimmables(lights, 1)
    expect(dimmables.length).toBe(1)
    const target = dimmables[0]!

    const roomRes = await request.post('/api/rooms', { data: { name: 'E2E Coerce Single' } })
    const { id: roomId } = await roomRes.json() as { id: number }

    try {
      const r = await request.post('/api/sensors', {
        data: { roomId, type: 'light', deviceId: target.deviceId, label: 'Single Light' },
      })
      const { id: sensorId } = await r.json() as { id: number }

      // Persist a color theme directly via the single-light state route. The API still
      // accepts any theme key (UI-only restriction), so this simulates a value
      // persisted before this feature shipped or via a non-Warren client.
      const seed = await request.post(
        `/api/integrations/hue/lights/${encodeURIComponent(target.deviceId)}/state`,
        { data: { on: true, theme: 'rose' } },
      )
      expect(seed.ok()).toBeTruthy()

      // First read after seeding triggers coercion.
      let sensors = await (await request.get('/api/sensors')).json() as Array<{
        id: number; lightTheme?: string | null
      }>
      let row = sensors.find(s => s.id === sensorId)
      expect(row!.lightTheme).toBe('everyday')

      // Subsequent read short-circuits — value stays 'everyday'.
      sensors = await (await request.get('/api/sensors')).json()
      row = sensors.find(s => s.id === sensorId)
      expect(row!.lightTheme).toBe('everyday')
    } finally {
      await request.delete(`/api/rooms/${roomId}`)
      await unpairBridge(request)
    }
  })

  test('white-only group with persisted color theme is coerced; mixed group is left alone', async ({ request }) => {
    await loginViaApi(request)
    await unpairBridge(request)
    expect(await pairFakeBridge(request, 3)).toBe(true)

    const lights = await getLights(request)
    const colorLight = pickColorLight(lights)
    const dimmables = pickDimmables(lights, 2)
    expect(colorLight).toBeTruthy()
    expect(dimmables.length).toBe(2)

    const roomRes = await request.post('/api/rooms', { data: { name: 'E2E Coerce Group' } })
    const { id: roomId } = await roomRes.json() as { id: number }

    try {
      // Assign all three lights to the same room.
      const ids: Record<string, number> = {}
      for (const [key, light] of [['color', colorLight!], ['d1', dimmables[0]!], ['d2', dimmables[1]!]] as const) {
        const r = await request.post('/api/sensors', {
          data: { roomId, type: 'light', deviceId: light.deviceId, label: light.name ?? 'Light' },
        })
        const { id } = await r.json() as { id: number }
        ids[key] = id
      }

      // White-only group: the two dimmables. Persist 'rose' (a color theme).
      const whiteOnlyRes = await request.post(`/api/rooms/${roomId}/light-groups`, {
        data: { name: 'White-only group', sensorIds: [ids.d1, ids.d2], theme: 'rose' },
      })
      expect(whiteOnlyRes.ok()).toBeTruthy()
      const { id: whiteOnlyId } = await whiteOnlyRes.json() as { id: number }

      // Mixed group: color + one dimmable. Persist 'amber' (a color theme).
      // We cannot put d1 in two groups simultaneously (sensors are unique per group),
      // so this group uses [color, d2] — but d2 was just used in whiteOnlyId, so
      // we'd hit the uniqueness constraint. Instead, build a SECOND room with its
      // own three-light copy. Skip that complexity: we already verified mixed-group
      // behavior in light-group.spec.ts (Amber theme survives on a color+dimmable
      // group). Here we focus exclusively on the white-only coercion path.

      // First read of /api/rooms triggers coercion on the white-only group.
      let rooms = await (await request.get('/api/rooms')).json() as Array<{
        id: number
        lightGroups: Array<{ id: number; theme: string; hasColorCapableMember: boolean }>
      }>
      const room1 = rooms.find(r => r.id === roomId)!
      const whiteOnlyGroup = room1.lightGroups.find(g => g.id === whiteOnlyId)!
      expect(whiteOnlyGroup.theme).toBe('everyday')
      expect(whiteOnlyGroup.hasColorCapableMember).toBe(false)

      // Second read — value stays 'everyday', no further UPDATE.
      rooms = await (await request.get('/api/rooms')).json()
      const whiteOnlyGroup2 = rooms.find(r => r.id === roomId)!.lightGroups.find(g => g.id === whiteOnlyId)!
      expect(whiteOnlyGroup2.theme).toBe('everyday')
      expect(whiteOnlyGroup2.hasColorCapableMember).toBe(false)
    } finally {
      await request.delete(`/api/rooms/${roomId}`)
      await unpairBridge(request)
    }
  })

  test('mixed group with color theme is NOT coerced; hasColorCapableMember is true', async ({ request }) => {
    await loginViaApi(request)
    await unpairBridge(request)
    expect(await pairFakeBridge(request, 3)).toBe(true)

    const lights = await getLights(request)
    const colorLight = pickColorLight(lights)
    const dimmable = pickDimmables(lights, 1)[0]
    expect(colorLight).toBeTruthy()
    expect(dimmable).toBeTruthy()

    const roomRes = await request.post('/api/rooms', { data: { name: 'E2E Mixed Group' } })
    const { id: roomId } = await roomRes.json() as { id: number }

    try {
      const sensorIds: number[] = []
      for (const light of [colorLight!, dimmable!]) {
        const r = await request.post('/api/sensors', {
          data: { roomId, type: 'light', deviceId: light.deviceId, label: light.name ?? 'Light' },
        })
        const { id } = await r.json() as { id: number }
        sensorIds.push(id)
      }

      const groupRes = await request.post(`/api/rooms/${roomId}/light-groups`, {
        data: { name: 'Mixed group', sensorIds, theme: 'amber' },
      })
      const { id: groupId } = await groupRes.json() as { id: number }

      const rooms = await (await request.get('/api/rooms')).json() as Array<{
        id: number
        lightGroups: Array<{ id: number; theme: string; hasColorCapableMember: boolean }>
      }>
      const group = rooms.find(r => r.id === roomId)!.lightGroups.find(g => g.id === groupId)!
      expect(group.theme).toBe('amber')  // not coerced
      expect(group.hasColorCapableMember).toBe(true)
    } finally {
      await request.delete(`/api/rooms/${roomId}`)
      await unpairBridge(request)
    }
  })

  test('coerced group reflects the coercion via group-state POST too', async ({ request }) => {
    await loginViaApi(request)
    await unpairBridge(request)
    expect(await pairFakeBridge(request, 3)).toBe(true)

    const lights = await getLights(request)
    const dimmables = pickDimmables(lights, 2)
    expect(dimmables.length).toBe(2)
    const dimmable1 = dimmables[0]!
    const dimmable2 = dimmables[1]!

    const roomRes = await request.post('/api/rooms', { data: { name: 'E2E State POST Coerce' } })
    const { id: roomId } = await roomRes.json() as { id: number }

    try {
      const sensorIds: number[] = []
      for (const light of [dimmable1, dimmable2]) {
        const r = await request.post('/api/sensors', {
          data: { roomId, type: 'light', deviceId: light.deviceId, label: light.name ?? 'Light' },
        })
        const { id } = await r.json() as { id: number }
        sensorIds.push(id)
      }

      const groupRes = await request.post(`/api/rooms/${roomId}/light-groups`, {
        data: { name: 'WO group', sensorIds, theme: 'emerald' },
      })
      const { id: groupId } = await groupRes.json() as { id: number }

      // Trigger coercion via the state POST path (no GET in between).
      const stateRes = await request.post(`/api/light-groups/${groupId}/state`, {
        data: { on: true },
      })
      expect(stateRes.ok()).toBeTruthy()

      // Now confirm the persisted theme is 'everyday'.
      const rooms = await (await request.get('/api/rooms')).json() as Array<{
        id: number
        lightGroups: Array<{ id: number; theme: string }>
      }>
      const group = rooms.find(r => r.id === roomId)!.lightGroups.find(g => g.id === groupId)!
      expect(group.theme).toBe('everyday')
    } finally {
      await request.delete(`/api/rooms/${roomId}`)
      await unpairBridge(request)
    }
  })
})
