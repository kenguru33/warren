import { getDb } from '../../utils/db'
import { buildMasterView } from '../../utils/light-groups'
import type { MasterState, SensorView } from '../../../shared/types'

export default defineEventHandler((): MasterState | null => {
  const db = getDb()

  const rows = db.prepare(`
    SELECT s.id, hls.on_state AS hue_on, hls.brightness AS hue_bri, hls.reachable AS hue_reachable,
           hd.capabilities AS hue_capabilities
    FROM sensors s
    INNER JOIN hue_devices hd ON hd.device_id = s.device_id
    LEFT JOIN hue_light_state hls ON hls.device_id = s.device_id
    WHERE s.type = 'light' AND s.room_id IS NOT NULL AND hd.kind = 'light'
  `).all() as {
    id: number
    hue_on: number | null
    hue_bri: number | null
    hue_reachable: number | null
    hue_capabilities: string | null
  }[]

  // Only the fields buildMasterView reads — keep the projection minimal.
  const members = rows.map(r => ({
    id: r.id,
    lightOn: r.hue_on === null ? null : r.hue_on === 1,
    lightBrightness: r.hue_bri,
    lightReachable: r.hue_reachable === null ? null : r.hue_reachable === 1,
    capabilities: r.hue_capabilities ? JSON.parse(r.hue_capabilities) : undefined,
  })) as unknown as SensorView[]

  return buildMasterView(members)
})
