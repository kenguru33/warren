import { getDb } from '@/lib/server/db'

export async function POST(req: Request) {
  let body: { deviceId?: string; type?: string; streamUrl?: string; snapshotUrl?: string } = {}
  try { body = (await req.json()) ?? {} } catch {}

  const { deviceId, type, streamUrl, snapshotUrl } = body
  if (!deviceId) return Response.json({ statusCode: 400, message: 'deviceId is required' }, { status: 400 })
  if (!type) return Response.json({ statusCode: 400, message: 'type is required' }, { status: 400 })

  const db = getDb()
  db.prepare(`
    INSERT INTO sensor_announcements (device_id, type, stream_url, snapshot_url, last_seen)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (device_id, type) DO UPDATE SET
      stream_url   = excluded.stream_url,
      snapshot_url = excluded.snapshot_url,
      last_seen    = excluded.last_seen
  `).run(deviceId, type, streamUrl ?? null, snapshotUrl ?? null, Date.now())
  try {
    db.prepare('DELETE FROM blocked_sensors WHERE device_id = ? AND type = ?').run(deviceId, type)
  } catch {}
  console.log(`[announce] device announced: ${deviceId} type=${type}`, { streamUrl, snapshotUrl })

  return Response.json({ ok: true })
}
