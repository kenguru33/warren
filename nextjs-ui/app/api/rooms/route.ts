import { getDb } from '@/lib/server/db'
import { queryInflux } from '@/lib/server/influxdb'
import { fetchGroups, fetchMembers, buildGroupView, buildMasterView } from '@/lib/server/light-groups'
import type { RoomWithSensors, SensorView } from '@/lib/shared/types'
import type { LightThemeKey } from '@/lib/shared/light-themes'
import { isValidLightThemeKey } from '@/lib/shared/light-themes'

function toMs(t: unknown): number {
  if (typeof t === 'bigint') return Number(t / BigInt(1_000_000))
  if (t instanceof Date) return t.getTime()
  return Number(t)
}

export async function GET(): Promise<Response> {
  const db = getDb()

  const rooms = db.prepare('SELECT id, name FROM rooms ORDER BY created_at ASC').all() as { id: number; name: string }[]
  const sensors = db.prepare(`
    SELECT s.id, s.room_id, s.type, s.device_id, s.label, s.stream_url, s.snapshot_url,
           hls.on_state AS hue_on, hls.brightness AS hue_bri, hls.reachable AS hue_reachable,
           hls.theme AS hue_theme,
           hd.capabilities AS hue_capabilities, hd.name AS hue_name
    FROM sensors s
    LEFT JOIN hue_light_state hls ON hls.device_id = s.device_id
    LEFT JOIN hue_devices hd ON hd.device_id = s.device_id
    ORDER BY s.created_at ASC
  `).all() as {
    id: number; room_id: number; type: string; device_id: string | null
    label: string | null; stream_url: string | null; snapshot_url: string | null
    hue_on: number | null; hue_bri: number | null; hue_reachable: number | null
    hue_theme: string | null
    hue_capabilities: string | null; hue_name: string | null
  }[]

  const latestMap = new Map<string, { value: number; timeMs: number }>()
  for (const row of await queryInflux(`
    SELECT device_id, sensor_type, latest_value, last_recorded_at FROM (
      SELECT device_id, sensor_type,
             value AS latest_value,
             time  AS last_recorded_at,
             ROW_NUMBER() OVER (PARTITION BY device_id, sensor_type ORDER BY time DESC) AS rn
      FROM sensor_readings
    ) t WHERE rn = 1
  `)) {
    latestMap.set(`${row.device_id}:${row.sensor_type}`, {
      value: Number(row.latest_value),
      timeMs: toMs(row.last_recorded_at),
    })
  }

  const motionMap = new Map<string, number>()
  for (const row of await queryInflux(`
    SELECT device_id, last_motion_at FROM (
      SELECT device_id,
             time AS last_motion_at,
             ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY time DESC) AS rn
      FROM sensor_readings
      WHERE sensor_type = 'motion' AND value = 1
    ) t WHERE rn = 1
  `)) {
    motionMap.set(String(row.device_id), toMs(row.last_motion_at))
  }

  const configs = db.prepare(`
    SELECT device_id, ref_temp, heater_on_offset, heater_off_offset, fan_threshold FROM sensor_config
  `).all() as {
    device_id: string; ref_temp: number | null
    heater_on_offset: number; heater_off_offset: number; fan_threshold: number
  }[]
  const configMap = new Map(configs.map(c => [c.device_id, c]))

  function relayState(deviceId: string | null, temp: number | null) {
    if (temp === null || deviceId === null) return { heaterActive: null, fanActive: null }
    const cfg = configMap.get(deviceId)
    const refTemp    = cfg?.ref_temp          ?? null
    const heatOnOff  = cfg?.heater_on_offset  ?? 2.0
    const fanThr     = cfg?.fan_threshold     ?? 10.0
    const heaterOn   = refTemp !== null ? refTemp - heatOnOff : 18.0
    const fanOn      = refTemp !== null ? refTemp + fanThr    : 30.0
    return { heaterActive: temp <= heaterOn, fanActive: temp > fanOn }
  }

  const refStmt = db.prepare('SELECT ref_temp, ref_humidity FROM room_references WHERE room_id = ?')

  const allGroups = fetchGroups(db)
  const allMembers = fetchMembers(db)
  const sensorToGroup = new Map<number, { id: number; name: string }>()
  const groupNameById = new Map(allGroups.map(g => [g.id, g.name]))
  for (const m of allMembers) {
    const name = groupNameById.get(m.group_id)
    if (name) sensorToGroup.set(m.sensor_id, { id: m.group_id, name })
  }

  const result: RoomWithSensors[] = rooms.map(room => {
    const ref = refStmt.get(room.id) as { ref_temp: number | null; ref_humidity: number | null } | undefined

    const sensorViews: SensorView[] = sensors
      .filter(s => s.room_id === room.id)
      .map(s => {
        const key = s.device_id ? `${s.device_id}:${s.type}` : null
        const latest = key ? latestMap.get(key) : undefined
        const { heaterActive, fanActive } = s.type === 'temperature'
          ? relayState(s.device_id, latest?.value ?? null)
          : { heaterActive: null, fanActive: null }
        const isHue = s.device_id?.startsWith('hue-') ?? false
        const grp = sensorToGroup.get(s.id)
        return {
          id: s.id,
          roomId: s.room_id,
          type: s.type as SensorView['type'],
          deviceId: s.device_id,
          label: s.label,
          latestValue: latest?.value ?? null,
          lastRecordedAt: latest?.timeMs ?? null,
          streamUrl: s.stream_url,
          snapshotUrl: s.snapshot_url,
          lastMotion: s.device_id ? (motionMap.get(s.device_id) ?? null) : null,
          heaterActive,
          fanActive,
          origin: isHue ? 'hue' : 'esp32',
          capabilities: s.hue_capabilities ? JSON.parse(s.hue_capabilities) : undefined,
          lightOn: s.hue_on === null ? null : s.hue_on === 1,
          lightBrightness: s.hue_bri,
          lightReachable: s.hue_reachable === null ? null : s.hue_reachable === 1,
          lightTheme: isValidLightThemeKey(s.hue_theme) ? s.hue_theme as LightThemeKey : null,
          hueName: s.hue_name,
          groupId: grp?.id ?? null,
          groupName: grp?.name ?? null,
        }
      })

    const roomGroups = allGroups.filter(g => g.room_id === room.id)
    const sensorsById = new Map(sensorViews.map(s => [s.id, s]))
    const lightGroups = roomGroups.map(g => {
      const memberIds = allMembers.filter(m => m.group_id === g.id).map(m => m.sensor_id)
      const memberSensors = memberIds.map(id => sensorsById.get(id)).filter((s): s is SensorView => !!s)
      return buildGroupView(g, memberSensors)
    })

    const lightMaster = buildMasterView(sensorViews.filter(s => s.type === 'light'))

    return {
      id: room.id,
      name: room.name,
      reference: ref ? { refTemp: ref.ref_temp, refHumidity: ref.ref_humidity } : null,
      sensors: sensorViews,
      lightGroups,
      lightMaster,
    }
  })

  return Response.json(result)
}

export async function POST(req: Request) {
  let body: { name?: string } = {}
  try { body = (await req.json()) ?? {} } catch {}
  const name = body.name?.trim()
  if (!name) return Response.json({ statusCode: 400, message: 'name is required' }, { status: 400 })

  const db = getDb()
  const result = db.prepare('INSERT INTO rooms (name) VALUES (?)').run(name)
  return Response.json({ id: result.lastInsertRowid })
}
