import { getDb } from '../../utils/db'
import { pruneEmptyGroups } from '../../utils/light-groups'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, message: 'invalid id' })

  const db = getDb()
  const sensor = db.prepare('SELECT device_id, type FROM sensors WHERE id = ?').get(id) as { device_id: string | null; type: string } | undefined
  if (!sensor) throw createError({ statusCode: 404, message: 'sensor not found' })

  db.prepare('DELETE FROM sensors WHERE id = ?').run(id)

  if (sensor.device_id) {
    db.prepare('DELETE FROM sensor_announcements WHERE device_id = ? AND type = ?').run(sensor.device_id, sensor.type)
  }

  pruneEmptyGroups(db)

  return { ok: true }
})
