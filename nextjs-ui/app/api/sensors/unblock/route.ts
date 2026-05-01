import { getDb } from '@/lib/server/db'

export async function POST(req: Request) {
  let body: { deviceId?: string; type?: string } = {}
  try { body = (await req.json()) ?? {} } catch {}
  const { deviceId, type } = body
  if (!deviceId || !type) return Response.json({ statusCode: 400, message: 'deviceId and type required' }, { status: 400 })

  getDb().prepare('DELETE FROM blocked_sensors WHERE device_id = ? AND type = ?').run(deviceId, type)
  return Response.json({ ok: true })
}
