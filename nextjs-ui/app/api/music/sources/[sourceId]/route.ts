import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { httpErrorResponse, HttpError } from '@/lib/server/errors'
import {
  getSource, deleteSource, setDefaultSource,
  reorderSource, validateSourceName, listSources,
} from '@/lib/server/music'

type Ctx = RouteContext<'/api/music/sources/[sourceId]'>

async function resolve(ctx: Ctx): Promise<number> {
  const sourceId = Number((await ctx.params).sourceId)
  if (!sourceId || !Number.isFinite(sourceId)) throw new HttpError(400, 'invalid source id')
  return sourceId
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const sourceId = await resolve(ctx)
    const db = getDb()

    if (!getSource(db, sourceId)) throw new HttpError(404, 'source not found')

    let body: { name?: string; isDefault?: boolean; position?: number } = {}
    try { body = (await req.json()) ?? {} } catch { /* no-op patch */ }

    if (body.name !== undefined) {
      db.prepare('UPDATE music_sources SET name = ? WHERE id = ?')
        .run(validateSourceName(body.name), sourceId)
    }
    if (typeof body.position === 'number' && Number.isFinite(body.position)) {
      reorderSource(db, sourceId, body.position)
    }
    if (body.isDefault === true) {
      setDefaultSource(db, sourceId)
    }

    return Response.json(listSources(db))
  } catch (err) {
    return httpErrorResponse(err)
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const sourceId = await resolve(ctx)
    const db = getDb()
    deleteSource(db, sourceId)
    return Response.json(listSources(db))
  } catch (err) {
    return httpErrorResponse(err)
  }
}
