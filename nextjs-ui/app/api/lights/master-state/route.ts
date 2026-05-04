import { getDb } from '@/lib/server/db'
import { buildMasterView, masterFanOut, type FanOutMember } from '@/lib/server/light-groups'
import type { SensorView } from '@/lib/shared/types'

export async function GET() {
  const db = getDb()

  const rows = db.prepare(`
    SELECT hls.on_state AS hue_on, hls.brightness AS hue_bri, hls.reachable AS hue_reachable,
           hd.capabilities AS hue_capabilities
    FROM hue_devices hd
    LEFT JOIN hue_light_state hls ON hls.device_id = hd.device_id
    WHERE hd.kind = 'light'
  `).all() as {
    hue_on: number | null
    hue_bri: number | null
    hue_reachable: number | null
    hue_capabilities: string | null
  }[]

  const members = rows.map(r => ({
    lightOn: r.hue_on === null ? null : r.hue_on === 1,
    lightBrightness: r.hue_bri,
    lightReachable: r.hue_reachable === null ? null : r.hue_reachable === 1,
    capabilities: r.hue_capabilities ? JSON.parse(r.hue_capabilities) : undefined,
  })) as unknown as SensorView[]

  return Response.json(buildMasterView(members))
}

export async function POST(req: Request) {
  let body: { on?: boolean } = {}
  try { body = (await req.json()) ?? {} } catch {}
  if (body.on === undefined) {
    return Response.json({ statusCode: 400, message: 'on is required' }, { status: 400 })
  }

  const db = getDb()
  const members = db.prepare(`
    SELECT COALESCE(s.id, 0) AS sensor_id, hd.device_id, hd.hue_resource_id, hb.ip, hb.app_key, hd.capabilities
    FROM hue_devices hd
    INNER JOIN hue_bridge hb ON hb.bridge_id = hd.bridge_id
    LEFT JOIN sensors s ON s.device_id = hd.device_id AND s.type = 'light'
    WHERE hd.kind = 'light'
  `).all() as FanOutMember[]

  if (members.length === 0) {
    return Response.json({ statusCode: 409, message: 'no controllable lights' }, { status: 409 })
  }

  return Response.json(await masterFanOut(db, members, { on: body.on }))
}
