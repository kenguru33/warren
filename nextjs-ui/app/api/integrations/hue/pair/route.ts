import { getDb } from '@/lib/server/db'
import { hueRuntime } from '@/lib/server/hue/runtime'
import {
  pollForAppKey, pingBridge,
  HueLinkButtonError, HueUnreachableError,
} from '@/lib/server/hue/client'

export async function POST(req: Request) {
  let body: { ip?: string } = {}
  try { body = (await req.json()) ?? {} } catch {}
  const ip = body.ip?.trim()
  if (!ip) return Response.json({ statusCode: 400, message: 'ip is required' }, { status: 400 })

  let appKey: string
  try {
    appKey = await pollForAppKey(ip, { timeoutMs: 30_000, intervalMs: 1_000 })
  } catch (err) {
    if (err instanceof HueLinkButtonError) {
      return Response.json(
        { statusCode: 408, message: 'link_button_timeout', data: { error: 'link_button_timeout' } },
        { status: 408 },
      )
    }
    if (err instanceof HueUnreachableError) {
      return Response.json(
        { statusCode: 502, message: 'bridge_unreachable', data: { error: 'bridge_unreachable', detail: err.message } },
        { status: 502 },
      )
    }
    throw err
  }

  const cfg = await pingBridge(ip)
  if (!cfg) return Response.json({ statusCode: 502, message: 'bridge_unreachable' }, { status: 502 })

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

  return Response.json({
    bridge: { id: cfg.bridgeid, name: cfg.name, model: cfg.modelid, ip },
  })
}
