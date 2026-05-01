import { timingSafeEqual } from 'node:crypto'
import { getDb, hashUserPassword, verifyUserPassword } from '@/lib/server/db'
import { getSession } from '@/lib/server/session'

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function POST(req: Request) {
  let body: { currentPassword?: string; newPassword?: string } = {}
  try {
    body = (await req.json()) ?? {}
  } catch {
    return Response.json({ statusCode: 400, statusMessage: 'Invalid JSON' }, { status: 400 })
  }
  const { currentPassword, newPassword } = body

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return Response.json(
      { statusCode: 422, statusMessage: 'currentPassword and newPassword are required' },
      { status: 422 },
    )
  }
  if (newPassword.length < 8) {
    return Response.json(
      { statusCode: 422, statusMessage: 'New password must be at least 8 characters' },
      { status: 422 },
    )
  }

  const session = await getSession()
  const username = session.user?.name ?? ''

  const authPassword = process.env.WARREN_AUTH_PASSWORD ?? ''
  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM users WHERE username = ?').get(username) as
    | { password_hash: string }
    | undefined

  const currentOk = row
    ? await verifyUserPassword(currentPassword, row.password_hash)
    : safeEqual(currentPassword, authPassword)

  if (!currentOk) {
    return Response.json(
      { statusCode: 401, statusMessage: 'Current password is incorrect' },
      { status: 401 },
    )
  }

  const hash = await hashUserPassword(newPassword)
  db.prepare(
    "INSERT OR REPLACE INTO users (username, password_hash, updated_at) VALUES (?, ?, datetime('now'))",
  ).run(username, hash)

  return Response.json({ ok: true })
}
