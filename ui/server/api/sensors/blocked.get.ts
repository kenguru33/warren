import { getDb } from '../../utils/db'

export default defineEventHandler(() => {
  const db = getDb()
  const rows = db
    .prepare('SELECT device_id, type FROM blocked_sensors ORDER BY device_id, type')
    .all() as { device_id: string; type: string }[]
  return rows.map(r => ({ deviceId: r.device_id, type: r.type }))
})
