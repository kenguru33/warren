import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { setLightState, HueUnauthorizedError, HueUnreachableError } from '@/lib/server/hue/client'
import {
  isValidLightThemeKey,
  resolveLightTheme,
  paletteColorFor,
  hexToXy,
  whitePresetPayload,
} from '@/lib/shared/light-themes'

export async function POST(req: NextRequest, ctx: RouteContext<'/api/integrations/hue/lights/[id]/state'>) {
  const deviceId = (await ctx.params).id
  if (!deviceId) return Response.json({ statusCode: 400, message: 'invalid id' }, { status: 400 })

  let body: { on?: boolean; brightness?: number; theme?: string; color?: string } = {}
  try { body = (await req.json()) ?? {} } catch {}

  if (body.on === undefined && body.brightness === undefined && body.theme === undefined && body.color === undefined) {
    return Response.json({ statusCode: 400, message: 'on, brightness, theme, or color is required' }, { status: 400 })
  }
  if (body.brightness !== undefined && (body.brightness < 0 || body.brightness > 100)) {
    return Response.json({ statusCode: 400, message: 'brightness must be 0-100' }, { status: 400 })
  }
  if (body.theme !== undefined && !isValidLightThemeKey(body.theme)) {
    return Response.json({ statusCode: 400, message: 'invalid theme' }, { status: 400 })
  }
  if (body.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(body.color)) {
    return Response.json({ statusCode: 400, message: 'invalid color (expected #rrggbb)' }, { status: 400 })
  }

  const db = getDb()
  const device = db.prepare(`
    SELECT hd.hue_resource_id, hb.ip, hb.app_key, hd.capabilities
    FROM hue_devices hd
    INNER JOIN hue_bridge hb ON hb.bridge_id = hd.bridge_id
    WHERE hd.device_id = ? AND hd.kind = 'light'
  `).get(deviceId) as { hue_resource_id: string; ip: string; app_key: string; capabilities: string | null } | undefined

  if (!device) return Response.json({ statusCode: 404, message: 'light not found' }, { status: 404 })

  const caps = device.capabilities
    ? JSON.parse(device.capabilities) as { color?: boolean; colorTemp?: boolean; brightness?: boolean }
    : null
  const supportsColor = !!caps?.color
  const supportsColorTemp = !!caps?.colorTemp
  const supportsBrightness = !!caps?.brightness

  const huePayload: { on?: boolean; bri?: number; xy?: [number, number]; ct?: number } = {}
  if (body.on !== undefined) huePayload.on = body.on
  if (body.brightness !== undefined) huePayload.bri = Math.round((body.brightness / 100) * 254)
  if (body.theme !== undefined) {
    const theme = resolveLightTheme(body.theme)
    const whitePreset = whitePresetPayload(theme)
    if (whitePreset) {
      if (supportsColorTemp) {
        huePayload.ct = whitePreset.mirek
      } else if (supportsColor) {
        huePayload.xy = hexToXy(theme.bulbPalette[0] ?? '#ffffff')
      }
      // Pin preset brightness — caller-supplied brightness wins.
      if (supportsBrightness && body.brightness === undefined) {
        huePayload.bri = Math.round((whitePreset.brightness / 100) * 254)
      }
      if (body.on === undefined) huePayload.on = true
    } else if (supportsColor && theme.bulbPalette.length > 0) {
      huePayload.xy = hexToXy(paletteColorFor(theme, 0))
      if (body.on === undefined) huePayload.on = true
    }
  }
  if (body.color !== undefined && supportsColor) {
    huePayload.xy = hexToXy(body.color)
    if (body.on === undefined) huePayload.on = true
  }

  try {
    await setLightState(device.ip, device.app_key, device.hue_resource_id, huePayload)
  } catch (err) {
    if (err instanceof HueUnauthorizedError) {
      return Response.json({ statusCode: 502, message: 'unauthorized', data: { error: 'unauthorized' } }, { status: 502 })
    }
    if (err instanceof HueUnreachableError) {
      return Response.json({ statusCode: 502, message: 'bridge_unreachable', data: { error: 'bridge_unreachable' } }, { status: 502 })
    }
    throw err
  }

  const now = Date.now()
  const cachedOn = huePayload.on === undefined ? null : (huePayload.on ? 1 : 0)
  // Theme persistence:
  //   - request supplied a theme → write it (sticky tile chrome)
  //   - request supplied a custom color → clear the theme (custom hex contradicts a preset)
  //   - otherwise → leave whatever was there
  let themeUpdate: { mode: 'set'; value: string } | { mode: 'clear' } | { mode: 'keep' }
  if (body.theme !== undefined) themeUpdate = { mode: 'set', value: body.theme }
  else if (body.color !== undefined) themeUpdate = { mode: 'clear' }
  else themeUpdate = { mode: 'keep' }

  if (themeUpdate.mode === 'clear') {
    // Force theme = NULL on update; on insert, NULL is the default.
    db.prepare(`
      INSERT INTO hue_light_state (device_id, on_state, brightness, reachable, theme, updated_at)
      VALUES (?, COALESCE(?, 0), ?, 1, NULL, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        on_state   = COALESCE(?, on_state),
        brightness = COALESCE(?, brightness),
        theme      = NULL,
        updated_at = ?
    `).run(deviceId, cachedOn, huePayload.bri ?? null, now, cachedOn, huePayload.bri ?? null, now)
  } else {
    // 'set' binds the theme key; 'keep' binds null and COALESCE preserves it.
    const themeBind = themeUpdate.mode === 'set' ? themeUpdate.value : null
    db.prepare(`
      INSERT INTO hue_light_state (device_id, on_state, brightness, reachable, theme, updated_at)
      VALUES (?, COALESCE(?, 0), ?, 1, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        on_state   = COALESCE(?, on_state),
        brightness = COALESCE(?, brightness),
        theme      = COALESCE(?, theme),
        updated_at = ?
    `).run(
      deviceId,
      cachedOn,
      huePayload.bri ?? null,
      themeBind,
      now,
      cachedOn,
      huePayload.bri ?? null,
      themeBind,
      now,
    )
  }

  return Response.json({ ok: true })
}
