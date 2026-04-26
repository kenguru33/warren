import { getDb } from '../../utils/db'
import { queryInflux } from '../../utils/influxdb'

function toMs(t: unknown): number {
  if (typeof t === 'bigint') return Number(t / BigInt(1_000_000))
  if (t instanceof Date) return t.getTime()
  return Number(t)
}

export default defineEventHandler(async () => {
  const db = getDb()

  // All persisted sensors (assigned and unassigned)
  const assigned = db.prepare(`
    SELECT s.id, s.type, s.label, s.device_id, s.stream_url, s.snapshot_url,
           r.id AS room_id, r.name AS room_name
    FROM sensors s
    LEFT JOIN rooms r ON r.id = s.room_id
    ORDER BY r.name ASC, s.type ASC
  `).all() as {
    id: number; type: string; label: string | null; device_id: string | null
    stream_url: string | null; snapshot_url: string | null
    room_id: number | null; room_name: string | null
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

  // Unassigned sensors from InfluxDB (temperature, humidity, motion)
  const unassignedInflux = [...latestMap.entries()]
    .filter(([key]) => !assignedKeys.has(key) && !blockedKeys.has(key))
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
    return {
      id: s.id as number | null,
      type: s.type,
      label: s.label,
      deviceId: s.device_id,
      roomId: s.room_id,
      roomName: s.room_name,
      streamUrl: s.stream_url,
      snapshotUrl: s.snapshot_url,
      latestValue: latest?.value ?? null,
      lastRecordedAt: latest?.timeMs ?? null,
      heaterActive,
      fanActive,
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

  return [...assignedResult, ...unassignedResult]
})
