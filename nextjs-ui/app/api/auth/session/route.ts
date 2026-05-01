import { getSession } from '@/lib/server/session'

export async function GET() {
  const session = await getSession()
  return Response.json({ user: session.user ?? null })
}
