import { getDb } from '../../../../utils/db'
import { pruneEmptyGroups } from '../../../../utils/light-groups'

export default defineEventHandler((event) => {
  const roomId = Number(getRouterParam(event, 'id'))
  const sensorId = Number(getRouterParam(event, 'sensorId'))
  if (!roomId || !sensorId) throw createError({ statusCode: 400, message: 'invalid id' })

  const db = getDb()
  const tx = db.transaction(() => {
    const result = db
      .prepare('UPDATE sensors SET room_id = NULL WHERE id = ? AND room_id = ?')
      .run(sensorId, roomId)
    if (result.changes === 0) throw createError({ statusCode: 404, message: 'sensor not found in room' })
    db.prepare('DELETE FROM light_group_members WHERE sensor_id = ?').run(sensorId)
    pruneEmptyGroups(db)
  })
  tx()

  return { ok: true }
})
