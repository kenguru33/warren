import mqtt, { type MqttClient } from 'mqtt'
import { getDb } from './db'

declare global {
  // eslint-disable-next-line no-var
  var __warren_mqtt_client: MqttClient | undefined
}

export function startMqtt(): MqttClient {
  if (globalThis.__warren_mqtt_client) return globalThis.__warren_mqtt_client

  const brokerUrl = process.env.MQTT_URL ?? 'mqtt://localhost:1883'
  const client = mqtt.connect(brokerUrl, {
    clientId: 'warren-nextjs',
    reconnectPeriod: 5000,
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS,
  })

  client.on('connect', () => {
    client.subscribe('warren/sensors/+/announce', { qos: 0 })
  })

  client.on('message', (topic, payload) => {
    const parts = topic.split('/')
    const deviceId = parts[2]
    if (!deviceId) return
    let data: { type?: string; streamUrl?: string; snapshotUrl?: string } = {}
    try { data = JSON.parse(payload.toString()) } catch { return }

    const type = data.type ?? 'camera'
    const streamUrl = data.streamUrl ?? null
    const snapshotUrl = data.snapshotUrl ?? null

    try {
      getDb().prepare(`
        INSERT INTO sensor_announcements (device_id, type, stream_url, snapshot_url, last_seen)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (device_id, type) DO UPDATE SET
          stream_url   = excluded.stream_url,
          snapshot_url = excluded.snapshot_url,
          last_seen    = excluded.last_seen
      `).run(deviceId, type, streamUrl, snapshotUrl, Date.now())
      console.log(`[mqtt] device announced: ${deviceId} type=${type}`, { streamUrl, snapshotUrl })
    } catch (err) {
      console.error(`[mqtt] failed to upsert announcement for ${deviceId}:`, err)
    }
  })

  client.on('error', (err) => {
    console.error('[mqtt] error:', err.message)
  })

  globalThis.__warren_mqtt_client = client
  return client
}

export function stopMqtt() {
  const client = globalThis.__warren_mqtt_client
  if (client) {
    client.end(true)
    globalThis.__warren_mqtt_client = undefined
  }
}
