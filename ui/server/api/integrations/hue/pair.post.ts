import { getDb } from '../../../utils/db'
import { hueRuntime } from '../../../utils/hue-runtime'
import {
  pollForAppKey, pingBridge,
  HueLinkButtonError, HueUnreachableError,
} from '../../../utils/hue'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ ip?: string }>(event)
  const ip = body.ip?.trim()
  if (!ip) throw createError({ statusCode: 400, message: 'ip is required' })

  let appKey: string
  try {
    appKey = await pollForAppKey(ip, { timeoutMs: 30_000, intervalMs: 1_000 })
  } catch (err) {
    if (err instanceof HueLinkButtonError) {
      throw createError({ statusCode: 408, message: 'link_button_timeout', data: { error: 'link_button_timeout' } })
    }
    if (err instanceof HueUnreachableError) {
      throw createError({ statusCode: 502, message: 'bridge_unreachable', data: { error: 'bridge_unreachable', detail: err.message } })
    }
    throw err
  }

  const cfg = await pingBridge(ip)
  if (!cfg) throw createError({ statusCode: 502, message: 'bridge_unreachable' })

  const now = Date.now()
  getDb().prepare(`
    INSERT INTO hue_bridge (id, bridge_id, name, model, ip, app_key, last_status, last_status_at)
    VALUES (1, ?, ?, ?, ?, ?, 'connected', ?)
    ON CONFLICT(id) DO UPDATE SET
      bridge_id = excluded.bridge_id,
      name = excluded.name,
      model = excluded.model,
      ip = excluded.ip,
      app_key = excluded.app_key,
      last_status = 'connected',
      last_status_at = excluded.last_status_at
  `).run(cfg.bridgeid, cfg.name, cfg.modelid, ip, appKey, now)

  hueRuntime.restart()

  return {
    bridge: { id: cfg.bridgeid, name: cfg.name, model: cfg.modelid, ip },
  }
})
