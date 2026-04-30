import { getDb } from '../../../../../utils/db'
import { setLightState, HueUnauthorizedError, HueUnreachableError } from '../../../../../utils/hue'
import {
  isValidLightThemeKey,
  resolveLightTheme,
  paletteColorFor,
  hexToXy,
} from '../../../../../../shared/utils/light-themes'

export default defineEventHandler(async (event) => {
  const deviceId = getRouterParam(event, 'id')
  if (!deviceId) throw createError({ statusCode: 400, message: 'invalid id' })

  const body = await readBody<{ on?: boolean; brightness?: number; theme?: string; color?: string }>(event)
  if (body.on === undefined && body.brightness === undefined && body.theme === undefined && body.color === undefined) {
    throw createError({ statusCode: 400, message: 'on, brightness, theme, or color is required' })
  }
  if (body.brightness !== undefined && (body.brightness < 0 || body.brightness > 100)) {
    throw createError({ statusCode: 400, message: 'brightness must be 0-100' })
  }
  if (body.theme !== undefined && !isValidLightThemeKey(body.theme)) {
    throw createError({ statusCode: 400, message: 'invalid theme' })
  }
  if (body.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(body.color)) {
    throw createError({ statusCode: 400, message: 'invalid color (expected #rrggbb)' })
  }

  const db = getDb()
  const device = db.prepare(`
    SELECT hd.hue_resource_id, hb.ip, hb.app_key, hd.capabilities
    FROM hue_devices hd
    INNER JOIN hue_bridge hb ON hb.bridge_id = hd.bridge_id
    WHERE hd.device_id = ? AND hd.kind = 'light'
  `).get(deviceId) as { hue_resource_id: string; ip: string; app_key: string; capabilities: string | null } | undefined

  if (!device) throw createError({ statusCode: 404, message: 'light not found' })

  const caps = device.capabilities ? JSON.parse(device.capabilities) as { color?: boolean } : null
  const supportsColor = !!caps?.color

  const huePayload: { on?: boolean; bri?: number; xy?: [number, number] } = {}
  if (body.on !== undefined) huePayload.on = body.on
  if (body.brightness !== undefined) huePayload.bri = Math.round((body.brightness / 100) * 254)
  if (body.theme !== undefined && supportsColor) {
    const theme = resolveLightTheme(body.theme)
    if (theme.bulbPalette.length > 0) {
      huePayload.xy = hexToXy(paletteColorFor(theme, 0))
      // A theme set without an explicit on toggle implies the user wants the bulb on so they
      // can see the new color.
      if (body.on === undefined) huePayload.on = true
    }
  }
  // `color` wins over `theme` when both are provided — single-color is more specific.
  if (body.color !== undefined && supportsColor) {
    huePayload.xy = hexToXy(body.color)
    if (body.on === undefined) huePayload.on = true
  }

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

  // Optimistic update of cached state. Theme-implied on:true must reflect here too,
  // so we read from huePayload (which captures both explicit and implied on) rather than body.
  const now = Date.now()
  const cachedOn = huePayload.on === undefined ? null : (huePayload.on ? 1 : 0)
  db.prepare(`
    INSERT INTO hue_light_state (device_id, on_state, brightness, reachable, updated_at)
    VALUES (?, COALESCE(?, 0), ?, 1, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      on_state   = COALESCE(?, on_state),
      brightness = COALESCE(?, brightness),
      updated_at = ?
  `).run(
    deviceId,
    cachedOn,
    huePayload.bri ?? null,
    now,
    cachedOn,
    huePayload.bri ?? null,
    now,
  )

  return { ok: true }
})
