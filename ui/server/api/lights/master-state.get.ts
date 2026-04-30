import { getDb } from '../../utils/db'
import { buildMasterView } from '../../utils/light-groups'
import type { MasterState, SensorView } from '../../../shared/types'

export default defineEventHandler((): MasterState | null => {
  const db = getDb()

  // Source: every light known to the bridge (hue_devices), regardless of whether
  // it has been registered as a Warren sensor or assigned to a room. The lights
  // page master switch should reflect/control the full bulb fleet.
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

  return buildMasterView(members)
})
