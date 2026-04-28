import { getDb } from '../../utils/db'
import { queryInflux } from '../../utils/influxdb'
import { resolveHueName } from '../../utils/hue-name'

function toMs(t: unknown): number {
  if (typeof t === 'bigint') return Number(t / BigInt(1_000_000))
  if (t instanceof Date) return t.getTime()
  return Number(t)
}

export default defineEventHandler(async () => {
  const db = getDb()

  // All persisted sensors (assigned and unassigned).
  // Pulls Hue light current-state via LEFT JOIN so the UI can render toggles/brightness.
  const assigned = db.prepare(`
    SELECT s.id, s.type, s.label, s.device_id, s.stream_url, s.snapshot_url,
           r.id AS room_id, r.name AS room_name,
           hls.on_state AS hue_on, hls.brightness AS hue_bri, hls.reachable AS hue_reachable,
           hd.capabilities AS hue_capabilities,
           hd.name AS hue_bridge_name, hd.display_name AS hue_display_name
    FROM sensors s
    LEFT JOIN rooms r ON r.id = s.room_id
    LEFT JOIN hue_light_state hls ON hls.device_id = s.device_id
    LEFT JOIN hue_devices hd ON hd.device_id = s.device_id
    ORDER BY r.name ASC, s.type ASC
  `).all() as {
    id: number; type: string; label: string | null; device_id: string | null
    stream_url: string | null; snapshot_url: string | null
    room_id: number | null; room_name: string | null
    hue_on: number | null; hue_bri: number | null; hue_reachable: number | null
    hue_capabilities: string | null
    hue_bridge_name: string | null; hue_display_name: string | null
  }[]

  const assignedKeys = new Set(assigned.filter(s => s.device_id).map(s => `${s.device_id}:${s.type}`))

  let blocked: { device_id: string; type: string }[] = []
  try {
    blocked = db.prepare('SELECT device_id, type FROM blocked_sensors').all() as typeof blocked
  } catch {}
  const blockedKeys = new Set(blocked.map(s => `${s.device_id}:${s.type}`))

  // Latest values from InfluxDB
  const latestMap = new Map<string, { value: number; timeMs: number }>()
  try {
    for (const row of await queryInflux(`
      SELECT device_id, sensor_type, latest_value, last_recorded_at FROM (
        SELECT device_id, sensor_type,
               value AS latest_value,
               time  AS last_recorded_at,
               ROW_NUMBER() OVER (PARTITION BY device_id, sensor_type ORDER BY time DESC) AS rn
        FROM sensor_readings
      ) t WHERE rn = 1
    `)) {
      latestMap.set(`${row.device_id}:${row.sensor_type}`, {
        value: Number(row.latest_value),
        timeMs: toMs(row.last_recorded_at),
      })
    }
  } catch {}

  // Unassigned sensors from InfluxDB (temperature, humidity, motion).
  // Hue device readings live in the same measurement but are surfaced via /api/integrations/hue
  // and the discovered-sensors flow, so skip them here.
  const unassignedInflux = [...latestMap.entries()]
    .filter(([key]) => !assignedKeys.has(key) && !blockedKeys.has(key))
    .filter(([key]) => !key.startsWith('hue-'))
    .map(([key, latest]) => {
      const [deviceId, type] = key.split(':')
      return { deviceId, type, latestValue: latest.value, lastRecordedAt: latest.timeMs, streamUrl: null, snapshotUrl: null }
    })

  // Unassigned announced sensors (cameras, etc.)
  const announcements = db
    .prepare('SELECT device_id, type, stream_url, snapshot_url, last_seen FROM sensor_announcements')
    .all() as { device_id: string; type: string; stream_url: string | null; snapshot_url: string | null; last_seen: number }[]

  const unassignedAnnounced = announcements
    .filter(a => !assignedKeys.has(`${a.device_id}:${a.type}`) && !blockedKeys.has(`${a.device_id}:${a.type}`))
    .map(a => ({
      deviceId: a.device_id, type: a.type, latestValue: null,
      lastRecordedAt: a.last_seen, streamUrl: a.stream_url, snapshotUrl: a.snapshot_url,
    }))

  // Unassigned Hue lights — they have no InfluxDB readings and no announcement,
  // so surface them straight from hue_devices + hue_light_state.
  const hueUnassigned = db.prepare(`
    SELECT hd.device_id, hd.kind, hd.subtype, hd.name, hd.display_name, hd.last_seen, hd.capabilities,
           hls.on_state AS hue_on, hls.brightness AS hue_bri, hls.reachable AS hue_reachable
    FROM hue_devices hd
    LEFT JOIN hue_light_state hls ON hls.device_id = hd.device_id
    WHERE hd.available = 1
  `).all() as {
    device_id: string; kind: string; subtype: string | null
    name: string | null; display_name: string | null
    last_seen: number; capabilities: string | null
    hue_on: number | null; hue_bri: number | null; hue_reachable: number | null
  }[]

  const unassignedHue = hueUnassigned
    .map(h => ({ ...h, type: h.kind === 'light' ? 'light' : (h.subtype ?? '') }))
    .filter(h => h.type)
    .filter(h => !assignedKeys.has(`${h.device_id}:${h.type}`) && !blockedKeys.has(`${h.device_id}:${h.type}`))

  // Relay config for computing heater/fan state
  const configs = db.prepare(`
    SELECT device_id, ref_temp, heater_on_offset, heater_off_offset, fan_threshold
    FROM sensor_config
  `).all() as {
    device_id: string; ref_temp: number | null
    heater_on_offset: number; heater_off_offset: number; fan_threshold: number
  }[]
  const configMap = new Map(configs.map(c => [c.device_id, c]))

  function relayState(deviceId: string | null, temp: number | null) {
    if (temp === null || deviceId === null) return { heaterActive: null, fanActive: null }
    const cfg = configMap.get(deviceId)
    const refTemp   = cfg?.ref_temp ?? null
    const heatOnOff = cfg?.heater_on_offset  ?? 2.0
    const heatOffOff = cfg?.heater_off_offset ?? 2.0
    const fanThr    = cfg?.fan_threshold      ?? 10.0
    const heaterOn  = refTemp !== null ? refTemp - heatOnOff  : 18.0
    const heaterOff = refTemp !== null ? refTemp + heatOffOff : 22.0
    const fanOn     = refTemp !== null ? refTemp + fanThr     : 30.0
    return {
      heaterActive: temp <= heaterOn,
      fanActive: temp > fanOn,
    }
  }

  const assignedResult = assigned.map(s => {
    const key = s.device_id ? `${s.device_id}:${s.type}` : null
    const latest = key ? latestMap.get(key) : undefined
    const { heaterActive, fanActive } = s.type === 'temperature'
      ? relayState(s.device_id, latest?.value ?? null)
      : { heaterActive: null, fanActive: null }
    const isHue = s.device_id?.startsWith('hue-') ?? false
    const resolvedLabel = isHue && s.device_id
      ? resolveHueName(s.hue_display_name, s.hue_bridge_name, s.device_id)
      : s.label
    return {
      id: s.id as number | null,
      type: s.type,
      label: resolvedLabel,
      bridgeName: isHue ? s.hue_bridge_name : undefined,
      displayName: isHue ? s.hue_display_name : undefined,
      deviceId: s.device_id,
      roomId: s.room_id,
      roomName: s.room_name,
      streamUrl: s.stream_url,
      snapshotUrl: s.snapshot_url,
      latestValue: latest?.value ?? null,
      lastRecordedAt: latest?.timeMs ?? null,
      heaterActive,
      fanActive,
      origin: isHue ? 'hue' : 'esp32',
      capabilities: s.hue_capabilities ? JSON.parse(s.hue_capabilities) : undefined,
      lightOn: s.hue_on === null ? null : s.hue_on === 1,
      lightBrightness: s.hue_bri,
      lightReachable: s.hue_reachable === null ? null : s.hue_reachable === 1,
    }
  })

  const unassignedResult = [...unassignedInflux, ...unassignedAnnounced].map(s => {
    const { heaterActive, fanActive } = s.type === 'temperature'
      ? relayState(s.deviceId, s.latestValue)
      : { heaterActive: null, fanActive: null }
    return {
      id: null as number | null,
      type: s.type,
      label: null as string | null,
      deviceId: s.deviceId,
      roomId: null as number | null,
      roomName: null as string | null,
      streamUrl: s.streamUrl,
      snapshotUrl: s.snapshotUrl,
      latestValue: s.latestValue,
      lastRecordedAt: s.lastRecordedAt,
      heaterActive,
      fanActive,
    }
  })

  const unassignedHueResult = unassignedHue.map(h => ({
    id: null as number | null,
    type: h.type,
    label: resolveHueName(h.display_name, h.name, h.device_id),
    bridgeName: h.name,
    displayName: h.display_name,
    deviceId: h.device_id,
    roomId: null as number | null,
    roomName: null as string | null,
    streamUrl: null as string | null,
    snapshotUrl: null as string | null,
    latestValue: null as number | null,
    lastRecordedAt: h.last_seen,
    heaterActive: null,
    fanActive: null,
    origin: 'hue',
    capabilities: h.capabilities ? JSON.parse(h.capabilities) : undefined,
    lightOn: h.hue_on === null ? null : h.hue_on === 1,
    lightBrightness: h.hue_bri,
    lightReachable: h.hue_reachable === null ? null : h.hue_reachable === 1,
  }))

  return [...assignedResult, ...unassignedResult, ...unassignedHueResult]
})
