import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { deviceId, type } = await readBody(event) as { deviceId: string; type: string }
  if (!deviceId || !type) throw createError({ statusCode: 400, message: 'deviceId and type required' })

  getDb().prepare('DELETE FROM blocked_sensors WHERE device_id = ? AND type = ?').run(deviceId, type)
  return { ok: true }
})
