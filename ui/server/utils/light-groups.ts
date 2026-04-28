import type { Database } from 'better-sqlite3'
import type { LightGroupState, LightGroupView, MasterState, SensorView } from '../../shared/types'
import { setLightState, HueUnauthorizedError, HueUnreachableError } from './hue'

export interface FanOutMember {
  sensor_id: number
  device_id: string
  hue_resource_id: string
  ip: string
  app_key: string
  capabilities: string | null
}

export interface FanOutResult {
  sensorId: number
  deviceId: string
  ok: boolean
  error?: string
}

export interface FanOutSummary {
  ok: boolean
  total: number
  successCount: number
  failureCount: number
  results: FanOutResult[]
}

export async function fanOutLightCommand(
  db: Database,
  members: FanOutMember[],
  body: { on?: boolean; brightness?: number },
): Promise<FanOutSummary> {
  const briScaled = body.brightness !== undefined ? Math.round((body.brightness / 100) * 254) : undefined

  const results: FanOutResult[] = []
  await Promise.all(members.map(async (m) => {
    const supportsBri = m.capabilities ? !!JSON.parse(m.capabilities)?.brightness : false
    const payload: { on?: boolean; bri?: number } = {}
    if (body.on !== undefined) payload.on = body.on
    if (briScaled !== undefined && supportsBri) {
      payload.bri = briScaled
      // Slider implies on (matches per-light behaviour)
      if (body.on === undefined) payload.on = true
    }
    if (Object.keys(payload).length === 0) {
      results.push({ sensorId: m.sensor_id, deviceId: m.device_id, ok: true })
      return
    }
    try {
      await setLightState(m.ip, m.app_key, m.hue_resource_id, payload)
      results.push({ sensorId: m.sensor_id, deviceId: m.device_id, ok: true })

      const now = Date.now()
      db.prepare(`
        INSERT INTO hue_light_state (device_id, on_state, brightness, reachable, updated_at)
        VALUES (?, COALESCE(?, 0), ?, 1, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          on_state   = COALESCE(?, on_state),
          brightness = COALESCE(?, brightness),
          updated_at = ?
      `).run(
        m.device_id,
        payload.on === undefined ? null : (payload.on ? 1 : 0),
        payload.bri ?? null,
        now,
        payload.on === undefined ? null : (payload.on ? 1 : 0),
        payload.bri ?? null,
        now,
      )
    } catch (err) {
      let code = 'failed'
      if (err instanceof HueUnauthorizedError) code = 'unauthorized'
      else if (err instanceof HueUnreachableError) code = 'unreachable'
      results.push({ sensorId: m.sensor_id, deviceId: m.device_id, ok: false, error: code })
    }
  }))

  const okCount = results.filter(r => r.ok).length
  return {
    ok: okCount > 0,
    total: results.length,
    successCount: okCount,
    failureCount: results.length - okCount,
    results,
  }
}

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

function computeOnOffState(members: SensorView[]): { state: LightGroupState; unreachableCount: number } {
  const reachable = members.filter(m => m.lightReachable !== false)
  const onCount = reachable.filter(m => m.lightOn === true).length
  const offCount = reachable.length - onCount

  let state: LightGroupState
  if (reachable.length === 0) state = 'all-off'
  else if (onCount === reachable.length) state = 'all-on'
  else if (offCount === reachable.length) state = 'all-off'
  else state = 'mixed'

  return { state, unreachableCount: members.filter(m => m.lightReachable === false).length }
}

export function buildGroupView(group: GroupRow, members: SensorView[]): LightGroupView {
  const { state, unreachableCount } = computeOnOffState(members)

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
    unreachableCount,
    hasBrightnessCapableMember: briCapable.length > 0,
  }
}

export function buildMasterView(members: SensorView[]): MasterState | null {
  if (members.length === 0) return null
  const { state, unreachableCount } = computeOnOffState(members)
  return { state, memberCount: members.length, unreachableCount }
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
