import { getDb } from '../../utils/db'
import {
  validateGroupName,
  assertLightSensorsInRoom,
  assertSensorsFreeForGroup,
} from '../../utils/light-groups'

export default defineEventHandler(async (event) => {
  const groupId = Number(getRouterParam(event, 'id'))
  if (!groupId) throw createError({ statusCode: 400, message: 'invalid group id' })

  const body = await readBody<{ name?: string; sensorIds?: number[] }>(event)

  const db = getDb()
  const group = db.prepare('SELECT id, room_id, name FROM light_groups WHERE id = ?')
    .get(groupId) as { id: number; room_id: number; name: string } | undefined
  if (!group) throw createError({ statusCode: 404, message: 'group not found' })

  let nextName: string | null = null
  if (body?.name !== undefined) {
    nextName = validateGroupName(body.name)
    if (nextName !== group.name) {
      const clash = db
        .prepare('SELECT id FROM light_groups WHERE room_id = ? AND name = ? AND id != ?')
        .get(group.room_id, nextName, groupId) as { id: number } | undefined
      if (clash) {
        throw createError({ statusCode: 409, message: 'a group with that name already exists in this room' })
      }
    }
  }

  let nextSensorIds: number[] | null = null
  if (body?.sensorIds !== undefined) {
    if (!Array.isArray(body.sensorIds)) {
      throw createError({ statusCode: 400, message: 'sensorIds must be an array' })
    }
    nextSensorIds = [...new Set(body.sensorIds.map(Number).filter(n => Number.isFinite(n)))]
    if (nextSensorIds.length < 2) {
      throw createError({ statusCode: 400, message: 'a group needs at least two lights' })
    }
    assertLightSensorsInRoom(db, group.room_id, nextSensorIds)
    assertSensorsFreeForGroup(db, nextSensorIds, groupId)
  }

  const tx = db.transaction(() => {
    if (nextName !== null && nextName !== group.name) {
      db.prepare('UPDATE light_groups SET name = ? WHERE id = ?').run(nextName, groupId)
    }
    if (nextSensorIds) {
      db.prepare('DELETE FROM light_group_members WHERE group_id = ?').run(groupId)
      const insert = db.prepare('INSERT INTO light_group_members (group_id, sensor_id) VALUES (?, ?)')
      for (const sid of nextSensorIds) insert.run(groupId, sid)
    }
  })
  tx()

  return { ok: true }
})
