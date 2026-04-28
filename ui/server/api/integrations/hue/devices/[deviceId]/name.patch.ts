import { getDb } from '../../../../../utils/db'
import {
  setLightName,
  setSensorName,
  HueUnauthorizedError,
  HueUnreachableError,
} from '../../../../../utils/hue'
import { resolveHueName } from '../../../../../utils/hue-name'

const MAX_NAME_LENGTH = 32

interface DeviceRow {
  device_id: string
  kind: 'light' | 'sensor'
  subtype: string | null
  name: string | null
  display_name: string | null
  hue_resource_id: string
  model: string | null
  capabilities: string | null
  last_seen: number
  available: number
}

interface BridgeRow {
  ip: string
  app_key: string
}

export default defineEventHandler(async (event) => {
  const deviceId = getRouterParam(event, 'deviceId')
  if (!deviceId) throw createError({ statusCode: 400, message: 'invalid device id' })

  const body = await readBody<{ name?: string | null }>(event)
  const raw = body?.name ?? null
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  const wantsClear = !trimmed

  if (!wantsClear && trimmed.length > MAX_NAME_LENGTH) {
    throw createError({
      statusCode: 400,
      message: 'name_too_long',
      data: { code: 'name_too_long', max: MAX_NAME_LENGTH },
    })
  }

  const db = getDb()
  const device = db.prepare(`
    SELECT device_id, kind, subtype, name, display_name, hue_resource_id,
           model, capabilities, last_seen, available
      FROM hue_devices
     WHERE device_id = ?
  `).get(deviceId) as DeviceRow | undefined

  if (!device) {
    throw createError({
      statusCode: 404,
      message: 'unknown_device',
      data: { code: 'unknown_device' },
    })
  }

  if (!wantsClear) {
    const bridge = db.prepare(`SELECT ip, app_key FROM hue_bridge WHERE id = 1`).get() as BridgeRow | undefined
    if (!bridge) {
      throw createError({
        statusCode: 409,
        message: 'bridge_not_paired',
        data: { code: 'bridge_not_paired' },
      })
    }

    try {
      if (device.kind === 'light') {
        await setLightName(bridge.ip, bridge.app_key, device.hue_resource_id, trimmed)
      } else {
        await setSensorName(bridge.ip, bridge.app_key, device.hue_resource_id, trimmed)
      }
    } catch (err) {
      if (err instanceof HueUnauthorizedError) {
        throw createError({
          statusCode: 401,
          message: 'bridge_unauthorized',
          data: { code: 'bridge_unauthorized' },
        })
      }
      if (err instanceof HueUnreachableError) {
        throw createError({
          statusCode: 503,
          message: 'bridge_unreachable',
          data: { code: 'bridge_unreachable' },
        })
      }
      throw err
    }

    db.prepare(`
      UPDATE hue_devices SET display_name = ?, name = ? WHERE device_id = ?
    `).run(trimmed, trimmed, deviceId)
  } else {
    db.prepare(`UPDATE hue_devices SET display_name = NULL WHERE device_id = ?`).run(deviceId)
  }

  const updated = db.prepare(`
    SELECT
      hd.device_id, hd.kind, hd.subtype, hd.name, hd.display_name, hd.model,
      hd.capabilities, hd.last_seen, hd.available,
      s.id AS sensor_id, s.room_id,
      r.name AS room_name,
      bs.device_id AS blocked_device_id
    FROM hue_devices hd
    LEFT JOIN sensors s ON s.device_id = hd.device_id
    LEFT JOIN rooms r ON r.id = s.room_id
    LEFT JOIN blocked_sensors bs ON bs.device_id = hd.device_id
    WHERE hd.device_id = ?
  `).get(deviceId) as {
    device_id: string; kind: 'light' | 'sensor'; subtype: string | null
    name: string | null; display_name: string | null; model: string | null
    capabilities: string | null; last_seen: number; available: number
    sensor_id: number | null; room_id: number | null; room_name: string | null
    blocked_device_id: string | null
  }

  return {
    deviceId: updated.device_id,
    kind: updated.kind,
    subtype: updated.subtype,
    name: resolveHueName(updated.display_name, updated.name, updated.device_id),
    bridgeName: updated.name,
    displayName: updated.display_name,
    model: updated.model,
    capabilities: updated.capabilities ? JSON.parse(updated.capabilities) : null,
    lastSeen: updated.last_seen,
    available: updated.available === 1,
    sensorId: updated.sensor_id,
    roomId: updated.room_id,
    roomName: updated.room_name,
    blocked: updated.blocked_device_id !== null,
  }
})
