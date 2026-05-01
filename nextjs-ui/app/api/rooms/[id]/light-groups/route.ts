import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import {
  validateGroupName,
  validateGroupTheme,
  assertLightSensorsInRoom,
  assertSensorsFreeForGroup,
} from '@/lib/server/light-groups'
import { httpErrorResponse } from '@/lib/server/errors'

export async function POST(req: NextRequest, ctx: RouteContext<'/api/rooms/[id]/light-groups'>) {
  try {
    const roomId = Number((await ctx.params).id)
    if (!roomId) return Response.json({ statusCode: 400, message: 'invalid room id' }, { status: 400 })

    let body: { name?: string; sensorIds?: number[]; theme?: string | null } = {}
    try { body = (await req.json()) ?? {} } catch {}

    const name = validateGroupName(body.name)
    const theme = validateGroupTheme(body.theme)
    const sensorIds = Array.isArray(body.sensorIds)
      ? [...new Set(body.sensorIds.map(Number).filter(n => Number.isFinite(n)))]
      : []
    if (sensorIds.length < 2) {
      return Response.json({ statusCode: 400, message: 'a group needs at least two lights' }, { status: 400 })
    }

    const db = getDb()
    const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId) as { id: number } | undefined
    if (!room) return Response.json({ statusCode: 404, message: 'room not found' }, { status: 404 })

    assertLightSensorsInRoom(db, roomId, sensorIds)
    assertSensorsFreeForGroup(db, sensorIds, null)

    const existing = db
      .prepare('SELECT id FROM light_groups WHERE room_id = ? AND name = ?')
      .get(roomId, name) as { id: number } | undefined
    if (existing) {
      return Response.json({ statusCode: 409, message: 'a group with that name already exists in this room' }, { status: 409 })
    }

    const insertGroup = db.prepare('INSERT INTO light_groups (room_id, name, theme) VALUES (?, ?, ?)')
    const insertMember = db.prepare('INSERT INTO light_group_members (group_id, sensor_id) VALUES (?, ?)')

    const tx = db.transaction(() => {
      const result = insertGroup.run(roomId, name, theme)
      const groupId = Number(result.lastInsertRowid)
      for (const sid of sensorIds) insertMember.run(groupId, sid)
      return groupId
    })
    const groupId = tx()

    return Response.json({ id: groupId, roomId, name, memberSensorIds: sensorIds })
  } catch (err) {
    return httpErrorResponse(err)
  }
}
