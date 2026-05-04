import { getDb } from '@/lib/server/db'
import { buildSnapshot } from '@/lib/server/backup/snapshot'
import { getSession } from '@/lib/server/session'

function timestampSuffix(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

export async function GET() {
  const session = await getSession()
  if (!session.user) {
    return Response.json({ statusCode: 401, statusMessage: 'Unauthorized' }, { status: 401 })
  }

  const snapshot = buildSnapshot(getDb())
  const filename = `warren-snapshot-${timestampSuffix(new Date())}.json`

  return new Response(JSON.stringify(snapshot, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
