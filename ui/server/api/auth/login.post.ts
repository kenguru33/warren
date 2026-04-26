import { timingSafeEqual } from 'node:crypto'
import { getDb, verifyUserPassword } from '../../utils/db'

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export default defineEventHandler(async (event) => {
  const { username, password } = await readBody<{ username?: string; password?: string }>(event) ?? {}
  const config = useRuntimeConfig(event)

  if (!config.authUsername || !config.authPassword) {
    throw createError({ statusCode: 500, statusMessage: 'Auth is not configured on the server' })
  }

  if (typeof username !== 'string' || typeof password !== 'string' || !safeEqual(username, config.authUsername)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM users WHERE username = ?').get(username) as { password_hash: string } | undefined

  const ok = row
    ? await verifyUserPassword(password, row.password_hash)
    : safeEqual(password, config.authPassword)

  if (!ok) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  await setUserSession(event, { user: { name: config.authUsername } })
  return { ok: true }
})
