import { getDb } from '../../../../../utils/db'
import { setLightState, HueUnauthorizedError, HueUnreachableError } from '../../../../../utils/hue'

export default defineEventHandler(async (event) => {
  const deviceId = getRouterParam(event, 'id')
  if (!deviceId) throw createError({ statusCode: 400, message: 'invalid id' })

  const body = await readBody<{ on?: boolean; brightness?: number }>(event)
  if (body.on === undefined && body.brightness === undefined) {
    throw createError({ statusCode: 400, message: 'on or brightness is required' })
  }
  if (body.brightness !== undefined && (body.brightness < 0 || body.brightness > 100)) {
    throw createError({ statusCode: 400, message: 'brightness must be 0-100' })
  }

  const db = getDb()
  const device = db.prepare(`
    SELECT hd.hue_resource_id, hb.ip, hb.app_key
    FROM hue_devices hd
    INNER JOIN hue_bridge hb ON hb.bridge_id = hd.bridge_id
    WHERE hd.device_id = ? AND hd.kind = 'light'
  `).get(deviceId) as { hue_resource_id: string; ip: string; app_key: string } | undefined

  if (!device) throw createError({ statusCode: 404, message: 'light not found' })

  const huePayload: { on?: boolean; bri?: number } = {}
  if (body.on !== undefined) huePayload.on = body.on
  if (body.brightness !== undefined) huePayload.bri = Math.round((body.brightness / 100) * 254)

  try {
    await setLightState(device.ip, device.app_key, device.hue_resource_id, huePayload)
  } catch (err) {
    if (err instanceof HueUnauthorizedError) {
      throw createError({ statusCode: 502, message: 'unauthorized', data: { error: 'unauthorized' } })
    }
    if (err instanceof HueUnreachableError) {
      throw createError({ statusCode: 502, message: 'bridge_unreachable', data: { error: 'bridge_unreachable' } })
    }
    throw err
  }

  // Optimistic update of cached state
  const now = Date.now()
  db.prepare(`
    INSERT INTO hue_light_state (device_id, on_state, brightness, reachable, updated_at)
    VALUES (?, COALESCE(?, 0), ?, 1, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      on_state   = COALESCE(?, on_state),
      brightness = COALESCE(?, brightness),
      updated_at = ?
  `).run(
    deviceId,
    body.on === undefined ? null : (body.on ? 1 : 0),
    huePayload.bri ?? null,
    now,
    body.on === undefined ? null : (body.on ? 1 : 0),
    huePayload.bri ?? null,
    now,
  )

  return { ok: true }
})
