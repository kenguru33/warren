import { getDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, message: 'invalid id' })

  const db = getDb()
  const result = db.prepare('DELETE FROM rooms WHERE id = ?').run(id)
  if (result.changes === 0) throw createError({ statusCode: 404, message: 'room not found' })
  return { ok: true }
})
