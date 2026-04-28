import { getDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const groupId = Number(getRouterParam(event, 'id'))
  if (!groupId) throw createError({ statusCode: 400, message: 'invalid group id' })

  const db = getDb()
  const result = db.prepare('DELETE FROM light_groups WHERE id = ?').run(groupId)
  if (result.changes === 0) throw createError({ statusCode: 404, message: 'group not found' })
  return { ok: true }
})
