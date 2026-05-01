import { getDb } from '@/lib/server/db'

export async function GET() {
  const rows = getDb()
    .prepare('SELECT device_id, type FROM blocked_sensors ORDER BY device_id, type')
    .all() as { device_id: string; type: string }[]
  return Response.json(rows.map(r => ({ deviceId: r.device_id, type: r.type })))
}
