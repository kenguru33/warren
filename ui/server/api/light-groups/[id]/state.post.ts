import { getDb } from '../../../utils/db'
import { setLightState, HueUnauthorizedError, HueUnreachableError } from '../../../utils/hue'

interface MemberLight {
  sensor_id: number
  device_id: string
  hue_resource_id: string
  ip: string
  app_key: string
  capabilities: string | null
}

interface MemberResult {
  sensorId: number
  deviceId: string
  ok: boolean
  error?: string
}

export default defineEventHandler(async (event) => {
  const groupId = Number(getRouterParam(event, 'id'))
  if (!groupId) throw createError({ statusCode: 400, message: 'invalid group id' })

  const body = await readBody<{ on?: boolean; brightness?: number }>(event)
  if (body?.on === undefined && body?.brightness === undefined) {
    throw createError({ statusCode: 400, message: 'on or brightness is required' })
  }
  if (body.brightness !== undefined && (body.brightness < 0 || body.brightness > 100)) {
    throw createError({ statusCode: 400, message: 'brightness must be 0-100' })
  }

  const db = getDb()
  const group = db.prepare('SELECT id FROM light_groups WHERE id = ?').get(groupId) as { id: number } | undefined
  if (!group) throw createError({ statusCode: 404, message: 'group not found' })

  const members = db.prepare(`
    SELECT m.sensor_id, s.device_id, hd.hue_resource_id, hb.ip, hb.app_key, hd.capabilities
    FROM light_group_members m
    INNER JOIN sensors s ON s.id = m.sensor_id
    INNER JOIN hue_devices hd ON hd.device_id = s.device_id
    INNER JOIN hue_bridge hb ON hb.bridge_id = hd.bridge_id
    WHERE m.group_id = ? AND hd.kind = 'light'
  `).all(groupId) as MemberLight[]

  if (members.length === 0) {
    throw createError({ statusCode: 409, message: 'group has no controllable lights' })
  }

  const briScaled = body.brightness !== undefined ? Math.round((body.brightness / 100) * 254) : undefined

  const results: MemberResult[] = []
  await Promise.all(members.map(async (m) => {
    const supportsBri = m.capabilities ? !!JSON.parse(m.capabilities)?.brightness : false
    const payload: { on?: boolean; bri?: number } = {}
    if (body.on !== undefined) payload.on = body.on
    if (briScaled !== undefined && supportsBri) {
      payload.bri = briScaled
      // Slider implies on (matches per-light behaviour)
      if (body.on === undefined) payload.on = true
    }
    if (Object.keys(payload).length === 0) {
      results.push({ sensorId: m.sensor_id, deviceId: m.device_id, ok: true })
      return
    }
    try {
      await setLightState(m.ip, m.app_key, m.hue_resource_id, payload)
      results.push({ sensorId: m.sensor_id, deviceId: m.device_id, ok: true })

      const now = Date.now()
      db.prepare(`
        INSERT INTO hue_light_state (device_id, on_state, brightness, reachable, updated_at)
        VALUES (?, COALESCE(?, 0), ?, 1, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          on_state   = COALESCE(?, on_state),
          brightness = COALESCE(?, brightness),
          updated_at = ?
      `).run(
        m.device_id,
        payload.on === undefined ? null : (payload.on ? 1 : 0),
        payload.bri ?? null,
        now,
        payload.on === undefined ? null : (payload.on ? 1 : 0),
        payload.bri ?? null,
        now,
      )
    } catch (err) {
      let code = 'failed'
      if (err instanceof HueUnauthorizedError) code = 'unauthorized'
      else if (err instanceof HueUnreachableError) code = 'unreachable'
      results.push({ sensorId: m.sensor_id, deviceId: m.device_id, ok: false, error: code })
    }
  }))

  const okCount = results.filter(r => r.ok).length
  return {
    ok: okCount > 0,
    total: results.length,
    successCount: okCount,
    failureCount: results.length - okCount,
    results,
  }
})
