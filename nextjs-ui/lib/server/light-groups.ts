import type { Database } from 'better-sqlite3'
import type { LightGroupState, LightGroupView, MasterState, SensorCapabilities, SensorView } from '@/lib/shared/types'
import {
  isValidLightThemeKey,
  resolveLightTheme,
  paletteColorFor,
  hexToXy,
  whitePresetPayload,
  WHITE_PRESET_KEYS,
  type LightTheme,
  type LightThemeKey,
} from '@/lib/shared/light-themes'
import { setLightState, setGroupState, HueUnauthorizedError, HueUnreachableError } from './hue/client'
import { HttpError } from './errors'

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

// Hue v1 bridges throttle hard once you exceed ~10 cmd/sec on /lights and drop
// or 503 the rest. Fanning N parallel PUTs at once is what causes "the master
// switch missed two bulbs" — so cap in-flight requests and retry transient
// failures. HueUnauthorizedError is terminal (wrong app key) and not retried.
const HUE_FANOUT_CONCURRENCY = 3
const HUE_FANOUT_RETRIES = 2

async function setLightStateRetrying(
  ip: string,
  key: string,
  hueResourceId: string,
  payload: { on?: boolean; bri?: number; xy?: [number, number]; ct?: number },
): Promise<void> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= HUE_FANOUT_RETRIES; attempt++) {
    try {
      await setLightState(ip, key, hueResourceId, payload)
      return
    } catch (err) {
      if (err instanceof HueUnauthorizedError) throw err
      lastErr = err
      if (attempt < HUE_FANOUT_RETRIES) {
        await new Promise(r => setTimeout(r, 150 * (attempt + 1)))
      }
    }
  }
  throw lastErr
}

async function pAll<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const idx = cursor++
        if (idx >= items.length) return
        await fn(items[idx], idx)
      }
    },
  )
  await Promise.all(workers)
}

export async function fanOutLightCommand(
  db: Database,
  members: FanOutMember[],
  body: { on?: boolean; brightness?: number },
  themeForColors?: LightTheme | null,
): Promise<FanOutSummary> {
  const whitePreset = themeForColors ? whitePresetPayload(themeForColors) : null
  const palette = themeForColors && !whitePreset && themeForColors.bulbPalette.length > 0 ? themeForColors : null
  const wantsOn = body.on === true
  // Only stamp the theme onto each member's per-light row when we're actively painting
  // (i.e. the caller is turning the lights on with a theme). For brightness-only
  // adjusts we pass null, so COALESCE preserves any existing per-member theme override.
  const themeKey = wantsOn ? (themeForColors?.key ?? null) : null

  // Caller-supplied brightness wins. Otherwise, when the caller is turning lights ON
  // with a white preset, pin the preset's brightness target.
  const briScaled = body.brightness !== undefined
    ? Math.round((body.brightness / 100) * 254)
    : (wantsOn && whitePreset !== null
        ? Math.round((whitePreset.brightness / 100) * 254)
        : undefined)

  const results: FanOutResult[] = []
  await pAll(members, HUE_FANOUT_CONCURRENCY, async (m, idx) => {
    const caps = m.capabilities ? JSON.parse(m.capabilities) : null
    const supportsBri = !!caps?.brightness
    const supportsColorTemp = !!caps?.colorTemp
    const supportsColor = !!caps?.color
    const payload: { on?: boolean; bri?: number; xy?: [number, number]; ct?: number } = {}
    if (body.on !== undefined) payload.on = body.on
    if (briScaled !== undefined && supportsBri) {
      payload.bri = briScaled
      if (body.on === undefined) payload.on = true
    }
    if (whitePreset && wantsOn) {
      if (supportsColorTemp) {
        payload.ct = whitePreset.mirek
      } else if (supportsColor) {
        // Defensive fallback for a color bulb without colorTemp capability flag.
        payload.xy = hexToXy(themeForColors!.bulbPalette[0] ?? '#ffffff')
      }
    } else if (palette && wantsOn && supportsColor) {
      const hex = paletteColorFor(palette, idx)
      payload.xy = hexToXy(hex)
    }
    const willTouchBridge = Object.keys(payload).length > 0
    try {
      if (willTouchBridge) {
        await setLightStateRetrying(m.ip, m.app_key, m.hue_resource_id, payload)
      }
      results.push({ sensorId: m.sensor_id, deviceId: m.device_id, ok: true })

      const now = Date.now()
      db.prepare(`
        INSERT INTO hue_light_state (device_id, on_state, brightness, reachable, theme, updated_at)
        VALUES (?, COALESCE(?, 0), ?, 1, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          on_state   = COALESCE(?, on_state),
          brightness = COALESCE(?, brightness),
          theme      = COALESCE(?, theme),
          updated_at = ?
      `).run(
        m.device_id,
        payload.on === undefined ? null : (payload.on ? 1 : 0),
        payload.bri ?? null,
        themeKey,
        now,
        payload.on === undefined ? null : (payload.on ? 1 : 0),
        payload.bri ?? null,
        themeKey,
        now,
      )
    } catch (err) {
      let code = 'failed'
      if (err instanceof HueUnauthorizedError) code = 'unauthorized'
      else if (err instanceof HueUnreachableError) code = 'unreachable'
      results.push({ sensorId: m.sensor_id, deviceId: m.device_id, ok: false, error: code })
    }
  })

  const okCount = results.filter(r => r.ok).length
  return {
    ok: okCount > 0,
    total: results.length,
    successCount: okCount,
    failureCount: results.length - okCount,
    results,
  }
}

// Master-switch fan-out. Sends a single PUT to the bridge's group 0 ("all
// lights paired to this bridge") per bridge, which the bridge delivers as a
// Zigbee group broadcast — far more reliable than N parallel per-light PUTs
// against the bridge's rate limiter. Falls back to per-light fan-out (with
// retries) when the group action fails for a bridge. Members are partitioned
// by bridge so multi-bridge setups still get one broadcast each.
export async function masterFanOut(
  db: Database,
  members: FanOutMember[],
  body: { on: boolean },
): Promise<FanOutSummary> {
  if (members.length === 0) {
    return { ok: false, total: 0, successCount: 0, failureCount: 0, results: [] }
  }

  const byBridge = new Map<string, FanOutMember[]>()
  for (const m of members) {
    const bridgeKey = `${m.ip} ${m.app_key}`
    let arr = byBridge.get(bridgeKey)
    if (!arr) { arr = []; byBridge.set(bridgeKey, arr) }
    arr.push(m)
  }

  const cacheStmt = db.prepare(`
    INSERT INTO hue_light_state (device_id, on_state, brightness, reachable, theme, updated_at)
    VALUES (?, ?, NULL, 1, NULL, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      on_state   = ?,
      updated_at = ?
  `)

  const results: FanOutResult[] = []
  await Promise.all([...byBridge.values()].map(async (group) => {
    const sample = group[0]
    try {
      await setGroupState(sample.ip, sample.app_key, '0', { on: body.on })
      const onValue = body.on ? 1 : 0
      const now = Date.now()
      for (const m of group) {
        cacheStmt.run(m.device_id, onValue, now, onValue, now)
        results.push({ sensorId: m.sensor_id, deviceId: m.device_id, ok: true })
      }
    } catch {
      // Bridge group action failed — fall back to per-light retry path for
      // this bridge's members so a partial-bridge outage still gets best-effort
      // delivery to every reachable light.
      const fallback = await fanOutLightCommand(db, group, body)
      results.push(...fallback.results)
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
  theme: string | null
}

export interface MemberRow {
  group_id: number
  sensor_id: number
}

export const GROUP_NAME_MAX = 60

export function fetchGroups(db: Database, roomId?: number): GroupRow[] {
  if (roomId !== undefined) {
    return db
      .prepare('SELECT id, room_id, name, theme FROM light_groups WHERE room_id = ? ORDER BY created_at ASC')
      .all(roomId) as GroupRow[]
  }
  return db
    .prepare('SELECT id, room_id, name, theme FROM light_groups ORDER BY created_at ASC')
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
  const colorCapable = members.filter(m => m.capabilities?.color === true)
  const withBri = briCapable.filter(m => typeof m.lightBrightness === 'number')
  const avg = withBri.length
    ? Math.round(withBri.reduce((s, m) => s + (m.lightBrightness ?? 0), 0) / withBri.length)
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
    hasColorCapableMember: colorCapable.length > 0,
    theme: resolveLightTheme(group.theme).key,
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

// "Color theme on a context that no longer offers it" coercion. Whites are
// universally available; color themes (slate, amber, …) are restricted to
// groups with at least one color-capable member. Anything outside that set
// gets a one-shot in-place rewrite to 'everyday' on first read.
const COERCION_TARGET: LightThemeKey = 'everyday'

function isColorThemeKey(key: string | null | undefined): key is LightThemeKey {
  return typeof key === 'string'
    && isValidLightThemeKey(key)
    && !WHITE_PRESET_KEYS.includes(key)
}

function memberIsColorCapable(m: { capabilities?: SensorCapabilities | string | null }): boolean {
  const caps = m.capabilities
  if (!caps) return false
  if (typeof caps === 'string') {
    try {
      const parsed = JSON.parse(caps) as SensorCapabilities
      return parsed?.color === true
    } catch {
      return false
    }
  }
  return caps.color === true
}

// Group-level coercion. A group's persisted color theme is rewritten to
// 'everyday' when the group currently has zero color-capable members.
// Idempotent: once rewritten, the eligibility test fails on the next read.
// Generic on the group shape so callers that select only `{ id, theme }` work
// alongside callers passing a full GroupRow.
export function maybeCoerceGroupTheme<T extends { id: number; theme: string | null }>(
  db: Database,
  group: T,
  members: ReadonlyArray<{ capabilities?: SensorCapabilities | string | null }>,
): T {
  if (!isColorThemeKey(group.theme)) return group
  if (members.some(memberIsColorCapable)) return group

  db.prepare('UPDATE light_groups SET theme = ? WHERE id = ?').run(COERCION_TARGET, group.id)
  return { ...group, theme: COERCION_TARGET }
}

// Per-light coercion. Single-light pickers never offer color themes
// regardless of bulb capabilities, so any persisted color key on a
// hue_light_state row is rewritten to 'everyday' on first read.
export function maybeCoerceLightTheme(
  db: Database,
  deviceId: string,
  currentTheme: string | null,
): LightThemeKey | null {
  if (currentTheme === null) return null
  if (!isColorThemeKey(currentTheme)) {
    return isValidLightThemeKey(currentTheme) ? currentTheme : null
  }
  db.prepare('UPDATE hue_light_state SET theme = ?, updated_at = ? WHERE device_id = ?')
    .run(COERCION_TARGET, Date.now(), deviceId)
  return COERCION_TARGET
}

export function assertLightSensorsInRoom(db: Database, roomId: number, sensorIds: number[]) {
  if (sensorIds.length === 0) return
  const placeholders = sensorIds.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT id, room_id, type FROM sensors WHERE id IN (${placeholders})
  `).all(...sensorIds) as { id: number; room_id: number | null; type: string }[]

  const found = new Set(rows.map(r => r.id))
  for (const sid of sensorIds) {
    if (!found.has(sid)) throw new HttpError(400, `sensor ${sid} not found`)
  }
  for (const r of rows) {
    if (r.type !== 'light') throw new HttpError(400, `sensor ${r.id} is not a light`)
    if (r.room_id !== roomId) throw new HttpError(400, `sensor ${r.id} is not in room ${roomId}`)
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
    throw new HttpError(409, `sensor ${r.sensor_id} is already in group "${r.group_name}"`, {
      error: 'already_in_group',
      sensorId: r.sensor_id,
      groupId: r.group_id,
      groupName: r.group_name,
    })
  }
}

export function validateGroupName(name: unknown): string {
  if (typeof name !== 'string') throw new HttpError(400, 'name is required')
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new HttpError(400, 'name is required')
  if (trimmed.length > GROUP_NAME_MAX) {
    throw new HttpError(400, `name must be ${GROUP_NAME_MAX} characters or fewer`)
  }
  return trimmed
}

export function validateGroupTheme(theme: unknown): string | null {
  if (theme === undefined || theme === null) return null
  if (!isValidLightThemeKey(theme)) throw new HttpError(400, 'unknown theme key')
  return theme
}
