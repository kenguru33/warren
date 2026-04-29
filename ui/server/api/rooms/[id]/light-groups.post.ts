import { getDb } from '../../../utils/db'
import {
  validateGroupName,
  validateGroupTheme,
  assertLightSensorsInRoom,
  assertSensorsFreeForGroup,
} from '../../../utils/light-groups'

export default defineEventHandler(async (event) => {
  const roomId = Number(getRouterParam(event, 'id'))
  if (!roomId) throw createError({ statusCode: 400, message: 'invalid room id' })

  const body = await readBody<{ name?: string; sensorIds?: number[]; theme?: string | null }>(event)
  const name = validateGroupName(body?.name)
  const theme = validateGroupTheme(body?.theme)
  const sensorIds = Array.isArray(body?.sensorIds)
    ? [...new Set(body!.sensorIds.map(Number).filter(n => Number.isFinite(n)))]
    : []
  if (sensorIds.length < 2) {
    throw createError({ statusCode: 400, message: 'a group needs at least two lights' })
  }

  const db = getDb()
  const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId) as { id: number } | undefined
  if (!room) throw createError({ statusCode: 404, message: 'room not found' })

  assertLightSensorsInRoom(db, roomId, sensorIds)
  assertSensorsFreeForGroup(db, sensorIds, null)

  const existing = db
    .prepare('SELECT id FROM light_groups WHERE room_id = ? AND name = ?')
    .get(roomId, name) as { id: number } | undefined
  if (existing) {
    throw createError({ statusCode: 409, message: 'a group with that name already exists in this room' })
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

  return { id: groupId, roomId, name, memberSensorIds: sensorIds }
})
