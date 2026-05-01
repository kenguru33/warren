import { getDb } from '@/lib/server/db'

export async function DELETE(req: Request) {
  let body: { deviceId?: string; type?: string } = {}
  try { body = (await req.json()) ?? {} } catch {}
  const { deviceId, type } = body
  if (!deviceId || !type) return Response.json({ statusCode: 400, message: 'deviceId and type required' }, { status: 400 })

  const db = getDb()
  if (type !== 'camera') {
    db.prepare('INSERT OR IGNORE INTO blocked_sensors (device_id, type) VALUES (?, ?)').run(deviceId, type)
  }
  db.prepare('DELETE FROM sensor_announcements WHERE device_id = ? AND type = ?').run(deviceId, type)

  return Response.json({ ok: true })
}
