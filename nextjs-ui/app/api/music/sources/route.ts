import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { httpErrorResponse, HttpError } from '@/lib/server/errors'
import { isConfigured, listSources, addSource, validateSourceName } from '@/lib/server/music'
import { parseYouTubeMusicUrl, YOUTUBE_URL_HELP } from '@/lib/shared/youtube'

export async function GET() {
  try {
    return Response.json(listSources(getDb()))
  } catch (err) {
    return httpErrorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    if (!isConfigured(db)) throw new HttpError(404, 'music is not configured')

    let body: { url?: string; name?: string } = {}
    try { body = (await req.json()) ?? {} } catch { /* validated below */ }

    const parsed = parseYouTubeMusicUrl(typeof body.url === 'string' ? body.url : '')
    if (!parsed) {
      // Rejected at the point of entry, with the accepted forms spelled out.
      throw new HttpError(400, YOUTUBE_URL_HELP, { error: 'unrecognized_url' })
    }

    const name = validateSourceName(body.name)
    return Response.json(addSource(db, name, parsed.kind, parsed.contentId), { status: 201 })
  } catch (err) {
    return httpErrorResponse(err)
  }
}
