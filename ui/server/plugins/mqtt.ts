import mqtt from 'mqtt'
import { getDb } from '../utils/db'

export default defineNitroPlugin(() => {
  const brokerUrl = process.env.MQTT_URL ?? 'mqtt://localhost:1883'

  const client = mqtt.connect(brokerUrl, { clientId: 'homenut-nuxt', reconnectPeriod: 5000 })

  client.on('connect', () => {
    client.subscribe('homenut/sensors/+/announce', { qos: 0 })
  })

  client.on('message', (topic, payload) => {
    const parts = topic.split('/')
    const deviceId = parts[2]
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

  client.on('error', () => {})
})
