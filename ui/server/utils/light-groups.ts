import type { Database } from 'better-sqlite3'
import type { LightGroupView, SensorView } from '../../shared/types'

export interface GroupRow {
  id: number
  room_id: number
  name: string
}

export interface MemberRow {
  group_id: number
  sensor_id: number
}

export const GROUP_NAME_MAX = 60

export function fetchGroups(db: Database, roomId?: number): GroupRow[] {
  if (roomId !== undefined) {
    return db
      .prepare('SELECT id, room_id, name FROM light_groups WHERE room_id = ? ORDER BY created_at ASC')
      .all(roomId) as GroupRow[]
  }
  return db
    .prepare('SELECT id, room_id, name FROM light_groups ORDER BY created_at ASC')
    .all() as GroupRow[]
}

export function fetchMembers(db: Database, groupIds?: number[]): MemberRow[] {
  if (!groupIds) {
    return db.prepare('SELECT group_id, sensor_id FROM light_group_members').all() as MemberRow[]
  }
  if (groupIds.length === 0) return []
  const placeholders = groupIds.map(() => '?').join(',')
  return db
    .prepare(`SELECT group_id, sensor_id FROM light_group_members WHERE group_id IN (${placeholders})`)
    .all(...groupIds) as MemberRow[]
}

export function buildGroupView(group: GroupRow, members: SensorView[]): LightGroupView {
  const reachable = members.filter(m => m.lightReachable !== false)
  const onCount = reachable.filter(m => m.lightOn === true).length
  const offCount = reachable.length - onCount

  let state: LightGroupView['state']
  if (reachable.length === 0) state = 'all-off'
  else if (onCount === reachable.length) state = 'all-on'
  else if (offCount === reachable.length) state = 'all-off'
  else state = 'mixed'

  const briCapable = members.filter(m => m.capabilities?.brightness === true)
  const onWithBri = briCapable.filter(m => m.lightOn === true && typeof m.lightBrightness === 'number')
  const avg = onWithBri.length
    ? Math.round(onWithBri.reduce((s, m) => s + (m.lightBrightness ?? 0), 0) / onWithBri.length)
    : null

  return {
    id: group.id,
    roomId: group.room_id,
    name: group.name,
    memberSensorIds: members.map(m => m.id),
    memberCount: members.length,
    state,
    brightness: avg === null ? null : Math.round((avg / 254) * 100),
    unreachableCount: members.filter(m => m.lightReachable === false).length,
    hasBrightnessCapableMember: briCapable.length > 0,
  }
}

export function pruneEmptyGroups(db: Database) {
  db.prepare(`
    DELETE FROM light_groups
    WHERE id NOT IN (SELECT DISTINCT group_id FROM light_group_members)
  `).run()
}

export function assertLightSensorsInRoom(db: Database, roomId: number, sensorIds: number[]) {
  if (sensorIds.length === 0) return
  const placeholders = sensorIds.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT id, room_id, type FROM sensors WHERE id IN (${placeholders})
  `).all(...sensorIds) as { id: number; room_id: number | null; type: string }[]

  const found = new Set(rows.map(r => r.id))
  for (const sid of sensorIds) {
    if (!found.has(sid)) {
      throw createError({ statusCode: 400, message: `sensor ${sid} not found` })
    }
  }
  for (const r of rows) {
    if (r.type !== 'light') {
      throw createError({ statusCode: 400, message: `sensor ${r.id} is not a light` })
    }
    if (r.room_id !== roomId) {
      throw createError({ statusCode: 400, message: `sensor ${r.id} is not in room ${roomId}` })
    }
  }
}

export function assertSensorsFreeForGroup(db: Database, sensorIds: number[], excludeGroupId: number | null) {
  if (sensorIds.length === 0) return
  const placeholders = sensorIds.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT m.sensor_id, g.id AS group_id, g.name AS group_name
    FROM light_group_members m
    INNER JOIN light_groups g ON g.id = m.group_id
    WHERE m.sensor_id IN (${placeholders})
  `).all(...sensorIds) as { sensor_id: number; group_id: number; group_name: string }[]

  for (const r of rows) {
    if (r.group_id === excludeGroupId) continue
    throw createError({
      statusCode: 409,
      message: `sensor ${r.sensor_id} is already in group "${r.group_name}"`,
      data: { error: 'already_in_group', sensorId: r.sensor_id, groupId: r.group_id, groupName: r.group_name },
    })
  }
}

export function validateGroupName(name: unknown): string {
  if (typeof name !== 'string') throw createError({ statusCode: 400, message: 'name is required' })
  const trimmed = name.trim()
  if (trimmed.length === 0) throw createError({ statusCode: 400, message: 'name is required' })
  if (trimmed.length > GROUP_NAME_MAX) {
    throw createError({ statusCode: 400, message: `name must be ${GROUP_NAME_MAX} characters or fewer` })
  }
  return trimmed
}
