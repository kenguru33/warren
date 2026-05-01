// Module-scoped singleton owning the Hue background poller timer.
// boot.ts calls start() at server start. API endpoints can call restart()/stop()/forceSync().
// HMR-safe via globalThis caching.

import { Point } from '@influxdata/influxdb3-client'
import { getDb } from '../db'
import { getInfluxClient } from '../influxdb'
import {
  getLights, getSensors, lightCapabilities, lightSubtype,
  mapHueSensorType, sensorValue, buildDeviceId,
  HueUnauthorizedError, HueUnreachableError,
  type HueLightRaw, type HueSensorRaw,
} from './client'

const POLL_INTERVAL_MS = 10_000

interface BridgeRow {
  id: number
  bridge_id: string
  ip: string
  app_key: string
}

interface RuntimeState {
  timer: NodeJS.Timeout | null
  running: boolean
  consecutiveFailures: number
  lastWritten: Map<string, string>
}

declare global {
  // eslint-disable-next-line no-var
  var __warren_hue_state: RuntimeState | undefined
}

function state(): RuntimeState {
  if (!globalThis.__warren_hue_state) {
    globalThis.__warren_hue_state = {
      timer: null,
      running: false,
      consecutiveFailures: 0,
      lastWritten: new Map(),
    }
  }
  return globalThis.__warren_hue_state
}

function readBridge(): BridgeRow | null {
  return getDb().prepare('SELECT id, bridge_id, ip, app_key FROM hue_bridge WHERE id = 1')
    .get() as BridgeRow | undefined ?? null
}

function setStatus(status: string, alsoTouchSync = false) {
  const now = Date.now()
  if (alsoTouchSync) {
    getDb().prepare('UPDATE hue_bridge SET last_status = ?, last_status_at = ?, last_sync_at = ? WHERE id = 1')
      .run(status, now, now)
  } else {
    getDb().prepare('UPDATE hue_bridge SET last_status = ?, last_status_at = ? WHERE id = 1')
      .run(status, now)
  }
}

function upsertLight(bridgeId: string, light: HueLightRaw) {
  const db = getDb()
  const deviceId = buildDeviceId(bridgeId, light.id)
  const caps = lightCapabilities(light)
  db.prepare(`
    INSERT INTO hue_devices (device_id, bridge_id, hue_resource_id, kind, subtype, name, model, capabilities, last_seen, available)
    VALUES (?, ?, ?, 'light', ?, ?, ?, ?, ?, 1)
    ON CONFLICT(device_id) DO UPDATE SET
      name = excluded.name,
      model = excluded.model,
      subtype = excluded.subtype,
      capabilities = excluded.capabilities,
      last_seen = excluded.last_seen,
      available = 1
  `).run(deviceId, bridgeId, light.id, lightSubtype(light), light.name, light.modelid ?? null,
         JSON.stringify(caps), Date.now())

  db.prepare(`
    INSERT INTO hue_light_state (device_id, on_state, brightness, reachable, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      on_state = excluded.on_state,
      brightness = excluded.brightness,
      reachable = excluded.reachable,
      updated_at = excluded.updated_at
  `).run(
    deviceId,
    light.state.on ? 1 : 0,
    typeof light.state.bri === 'number' ? light.state.bri : null,
    light.state.reachable === false ? 0 : 1,
    Date.now(),
  )
}

function upsertSensor(bridgeId: string, sensor: HueSensorRaw) {
  const mapped = mapHueSensorType(sensor.type)
  if (!mapped) return
  const db = getDb()
  const deviceId = buildDeviceId(bridgeId, sensor.id)
  db.prepare(`
    INSERT INTO hue_devices (device_id, bridge_id, hue_resource_id, kind, subtype, name, model, capabilities, last_seen, available)
    VALUES (?, ?, ?, 'sensor', ?, ?, ?, NULL, ?, 1)
    ON CONFLICT(device_id) DO UPDATE SET
      name = excluded.name,
      model = excluded.model,
      subtype = excluded.subtype,
      last_seen = excluded.last_seen,
      available = 1
  `).run(deviceId, bridgeId, sensor.id, mapped, sensor.name, sensor.modelid ?? null, Date.now())
}

async function writeSensorReading(bridgeId: string, sensor: HueSensorRaw) {
  const mapped = mapHueSensorType(sensor.type)
  if (!mapped) return
  const value = sensorValue(sensor.type, sensor.state)
  if (value === null) return

  const deviceId = buildDeviceId(bridgeId, sensor.id)
  const lastUpdated = typeof sensor.state.lastupdated === 'string' ? sensor.state.lastupdated : ''
  const dedupeKey = `${deviceId}:${mapped}`
  const s = state()
  if (lastUpdated && s.lastWritten.get(dedupeKey) === lastUpdated) return

  const sensorRow = getDb()
    .prepare('SELECT room_id FROM sensors WHERE device_id = ? AND type = ?')
    .get(deviceId, mapped) as { room_id: number | null } | undefined
  const roomTag = sensorRow?.room_id ? String(sensorRow.room_id) : 'unassigned'

  const ts = lastUpdated ? new Date(`${lastUpdated}Z`) : new Date()

  const point = Point.measurement('sensor_readings')
    .setTag('device_id', deviceId)
    .setTag('sensor_type', mapped)
    .setTag('room_id', roomTag)
    .setFloatField('value', value)
    .setTimestamp(isNaN(ts.getTime()) ? new Date() : ts)

  await getInfluxClient().write(point)
  if (lastUpdated) s.lastWritten.set(dedupeKey, lastUpdated)
}

async function runSyncCycle(): Promise<void> {
  const s = state()
  if (s.running) return
  s.running = true
  try {
    const bridge = readBridge()
    if (!bridge) return

    const seenDeviceIds = new Set<string>()
    let lights: HueLightRaw[] = []
    let sensors: HueSensorRaw[] = []
    try {
      ;[lights, sensors] = await Promise.all([
        getLights(bridge.ip, bridge.app_key),
        getSensors(bridge.ip, bridge.app_key),
      ])
    } catch (e) {
      if (e instanceof HueUnauthorizedError) {
        setStatus('unauthorized')
        stopTimer()
        return
      }
      if (e instanceof HueUnreachableError) {
        s.consecutiveFailures += 1
        setStatus('unreachable')
        return
      }
      throw e
    }

    s.consecutiveFailures = 0

    for (const light of lights) {
      upsertLight(bridge.bridge_id, light)
      seenDeviceIds.add(buildDeviceId(bridge.bridge_id, light.id))
    }
    for (const sensor of sensors) {
      upsertSensor(bridge.bridge_id, sensor)
      const mapped = mapHueSensorType(sensor.type)
      if (mapped) seenDeviceIds.add(buildDeviceId(bridge.bridge_id, sensor.id))
    }

    const db = getDb()
    const allKnown = db.prepare('SELECT device_id FROM hue_devices WHERE bridge_id = ?')
      .all(bridge.bridge_id) as { device_id: string }[]
    const updateAvailability = db.prepare('UPDATE hue_devices SET available = 0 WHERE device_id = ?')
    for (const row of allKnown) {
      if (!seenDeviceIds.has(row.device_id)) updateAvailability.run(row.device_id)
    }

    for (const sensor of sensors) {
      try {
        await writeSensorReading(bridge.bridge_id, sensor)
      } catch (err) {
        console.error('[hue] failed to write sensor reading:', err)
      }
    }

    setStatus('connected', true)
  } finally {
    s.running = false
  }
}

function startTimer() {
  const s = state()
  if (s.timer) return
  s.timer = setInterval(() => {
    runSyncCycle().catch(err => console.error('[hue] sync cycle failed:', err))
  }, POLL_INTERVAL_MS)
}

function stopTimer() {
  const s = state()
  if (s.timer) clearInterval(s.timer)
  s.timer = null
}

export const hueRuntime = {
  start() {
    if (!readBridge()) return
    runSyncCycle().catch(err => console.error('[hue] initial sync failed:', err))
    startTimer()
  },
  restart() {
    stopTimer()
    const s = state()
    s.consecutiveFailures = 0
    s.lastWritten.clear()
    if (!readBridge()) return
    runSyncCycle().catch(err => console.error('[hue] restart sync failed:', err))
    startTimer()
  },
  stop() {
    stopTimer()
    const s = state()
    s.consecutiveFailures = 0
    s.lastWritten.clear()
  },
  async forceSync() {
    await runSyncCycle()
  },
  getCounts(): { lights: number; sensors: number } {
    const row = getDb().prepare(`
      SELECT
        SUM(CASE WHEN kind = 'light'  THEN 1 ELSE 0 END) AS lights,
        SUM(CASE WHEN kind = 'sensor' THEN 1 ELSE 0 END) AS sensors
      FROM hue_devices WHERE available = 1
    `).get() as { lights: number | null; sensors: number | null } | undefined
    return { lights: row?.lights ?? 0, sensors: row?.sensors ?? 0 }
  },
}
