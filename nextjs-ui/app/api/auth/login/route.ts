import { timingSafeEqual } from 'node:crypto'
import { getDb, verifyUserPassword } from '@/lib/server/db'
import { setSession } from '@/lib/server/session'

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function POST(req: Request) {
  let body: { username?: string; password?: string } = {}
  try {
    body = (await req.json()) ?? {}
  } catch {
    return Response.json({ statusCode: 400, statusMessage: 'Invalid JSON' }, { status: 400 })
  }

  const { username, password } = body
  const authUsername = process.env.WARREN_AUTH_USERNAME ?? ''
  const authPassword = process.env.WARREN_AUTH_PASSWORD ?? ''

  if (!authUsername || !authPassword) {
    return Response.json(
      { statusCode: 500, statusMessage: 'Auth is not configured on the server' },
      { status: 500 },
    )
  }

  if (typeof username !== 'string' || typeof password !== 'string' || !safeEqual(username, authUsername)) {
    return Response.json({ statusCode: 401, statusMessage: 'Invalid credentials' }, { status: 401 })
  }

  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM users WHERE username = ?').get(username) as
    | { password_hash: string }
    | undefined

  const ok = row
    ? await verifyUserPassword(password, row.password_hash)
    : safeEqual(password, authPassword)

  if (!ok) {
    return Response.json({ statusCode: 401, statusMessage: 'Invalid credentials' }, { status: 401 })
  }

  await setSession({ name: authUsername })
  return Response.json({ ok: true })
}
