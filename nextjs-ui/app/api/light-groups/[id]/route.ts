import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import {
  validateGroupName,
  validateGroupTheme,
  assertLightSensorsInRoom,
  assertSensorsFreeForGroup,
} from '@/lib/server/light-groups'
import { httpErrorResponse } from '@/lib/server/errors'

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/light-groups/[id]'>) {
  try {
    const groupId = Number((await ctx.params).id)
    if (!groupId) return Response.json({ statusCode: 400, message: 'invalid group id' }, { status: 400 })

    let body: { name?: string; sensorIds?: number[]; theme?: string | null } = {}
    try { body = (await req.json()) ?? {} } catch {}

    const db = getDb()
    const group = db.prepare('SELECT id, room_id, name FROM light_groups WHERE id = ?')
      .get(groupId) as { id: number; room_id: number; name: string } | undefined
    if (!group) return Response.json({ statusCode: 404, message: 'group not found' }, { status: 404 })

    let nextName: string | null = null
    if (body.name !== undefined) {
      nextName = validateGroupName(body.name)
      if (nextName !== group.name) {
        const clash = db
          .prepare('SELECT id FROM light_groups WHERE room_id = ? AND name = ? AND id != ?')
          .get(group.room_id, nextName, groupId) as { id: number } | undefined
        if (clash) {
          return Response.json({ statusCode: 409, message: 'a group with that name already exists in this room' }, { status: 409 })
        }
      }
    }

    let nextSensorIds: number[] | null = null
    if (body.sensorIds !== undefined) {
      if (!Array.isArray(body.sensorIds)) {
        return Response.json({ statusCode: 400, message: 'sensorIds must be an array' }, { status: 400 })
      }
      nextSensorIds = [...new Set(body.sensorIds.map(Number).filter(n => Number.isFinite(n)))]
      if (nextSensorIds.length < 2) {
        return Response.json({ statusCode: 400, message: 'a group needs at least two lights' }, { status: 400 })
      }
      assertLightSensorsInRoom(db, group.room_id, nextSensorIds)
      assertSensorsFreeForGroup(db, nextSensorIds, groupId)
    }

    const themeProvided = 'theme' in body
    const nextTheme = themeProvided ? validateGroupTheme(body.theme) : undefined

    const tx = db.transaction(() => {
      if (nextName !== null && nextName !== group.name) {
        db.prepare('UPDATE light_groups SET name = ? WHERE id = ?').run(nextName, groupId)
      }
      if (nextTheme !== undefined) {
        db.prepare('UPDATE light_groups SET theme = ? WHERE id = ?').run(nextTheme, groupId)
      }
      if (nextSensorIds) {
        db.prepare('DELETE FROM light_group_members WHERE group_id = ?').run(groupId)
        const insert = db.prepare('INSERT INTO light_group_members (group_id, sensor_id) VALUES (?, ?)')
        for (const sid of nextSensorIds) insert.run(groupId, sid)
      }
    })
    tx()

    return Response.json({ ok: true })
  } catch (err) {
    return httpErrorResponse(err)
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/light-groups/[id]'>) {
  const groupId = Number((await ctx.params).id)
  if (!groupId) return Response.json({ statusCode: 400, message: 'invalid group id' }, { status: 400 })

  const db = getDb()
  const result = db.prepare('DELETE FROM light_groups WHERE id = ?').run(groupId)
  if (result.changes === 0) return Response.json({ statusCode: 404, message: 'group not found' }, { status: 404 })
  return Response.json({ ok: true })
}
