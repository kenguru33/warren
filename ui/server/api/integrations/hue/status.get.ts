import { getDb } from '../../../utils/db'
import { hueRuntime } from '../../../utils/hue-runtime'

export default defineEventHandler(() => {
  const bridge = getDb().prepare(`
    SELECT bridge_id, name, model, ip, last_sync_at, last_status, last_status_at
    FROM hue_bridge WHERE id = 1
  `).get() as {
    bridge_id: string; name: string | null; model: string | null; ip: string
    last_sync_at: number | null; last_status: string | null; last_status_at: number | null
  } | undefined

  if (!bridge) {
    return { connected: false, bridge: null, lastSyncAt: null, lastStatus: null, counts: { lights: 0, sensors: 0 } }
  }

  return {
    connected: bridge.last_status === 'connected',
    bridge: { id: bridge.bridge_id, name: bridge.name, model: bridge.model, ip: bridge.ip },
    lastSyncAt: bridge.last_sync_at,
    lastStatus: bridge.last_status,
    lastStatusAt: bridge.last_status_at,
    counts: hueRuntime.getCounts(),
  }
})
