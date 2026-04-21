import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { name } = await readBody<{ name: string }>(event)
  if (!name?.trim()) throw createError({ statusCode: 400, message: 'name is required' })

  const db = getDb()
  const result = db.prepare('INSERT INTO rooms (name) VALUES (?)').run(name.trim())
  return { id: result.lastInsertRowid }
})
