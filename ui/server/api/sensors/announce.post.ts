import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { deviceId, type, streamUrl, snapshotUrl } = await readBody<{
    deviceId: string
    type: string
    streamUrl?: string
    snapshotUrl?: string
  }>(event)

  if (!deviceId) throw createError({ statusCode: 400, message: 'deviceId is required' })
  if (!type) throw createError({ statusCode: 400, message: 'type is required' })

  getDb().prepare(`
    INSERT INTO sensor_announcements (device_id, type, stream_url, snapshot_url, last_seen)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (device_id, type) DO UPDATE SET
      stream_url   = excluded.stream_url,
      snapshot_url = excluded.snapshot_url,
      last_seen    = excluded.last_seen
  `).run(deviceId, type, streamUrl ?? null, snapshotUrl ?? null, Date.now())
  console.log(`[announce] device announced: ${deviceId} type=${type}`, { streamUrl, snapshotUrl })

  return { ok: true }
})
