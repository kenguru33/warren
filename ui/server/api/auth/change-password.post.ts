import { timingSafeEqual } from 'node:crypto'
import { getDb, hashUserPassword, verifyUserPassword } from '../../utils/db'

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export default defineEventHandler(async (event) => {
  const { currentPassword, newPassword } = await readBody<{ currentPassword?: string; newPassword?: string }>(event) ?? {}

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    throw createError({ statusCode: 422, statusMessage: 'currentPassword and newPassword are required' })
  }

  if (newPassword.length < 8) {
    throw createError({ statusCode: 422, statusMessage: 'New password must be at least 8 characters' })
  }

  const config = useRuntimeConfig(event)
  const session = await getUserSession(event)
  const username = (session.user as { name: string } | undefined)?.name ?? ''

  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM users WHERE username = ?').get(username) as { password_hash: string } | undefined

  const currentOk = row
    ? await verifyUserPassword(currentPassword, row.password_hash)
    : safeEqual(currentPassword, config.authPassword)

  if (!currentOk) {
    throw createError({ statusCode: 401, statusMessage: 'Current password is incorrect' })
  }

  const hash = await hashUserPassword(newPassword)
  db.prepare("INSERT OR REPLACE INTO users (username, password_hash, updated_at) VALUES (?, ?, datetime('now'))").run(username, hash)

  return { ok: true }
})
