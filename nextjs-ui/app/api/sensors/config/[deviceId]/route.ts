import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'

const DEFAULTS = {
  refTemp: null as number | null,
  heaterOnOffset: 2.0,
  heaterOffOffset: 2.0,
  fanThreshold: 10.0,
  pollInterval: 5,
  configFetchInterval: 60,
}

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/sensors/config/[deviceId]'>) {
  const { deviceId } = await ctx.params
  if (!deviceId) return Response.json({ statusCode: 400, message: 'deviceId is required' }, { status: 400 })

  const db = getDb()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO sensor_config (device_id, last_fetched_at)
    VALUES (?, ?)
    ON CONFLICT(device_id) DO UPDATE SET last_fetched_at = excluded.last_fetched_at
  `).run(deviceId, now)

  const row = db.prepare(`
    SELECT ref_temp, heater_on_offset, heater_off_offset, fan_threshold,
           poll_interval, config_fetch_interval, updated_at, last_fetched_at
    FROM sensor_config WHERE device_id = ?
  `).get(deviceId) as {
    ref_temp: number | null
    heater_on_offset: number
    heater_off_offset: number
    fan_threshold: number
    poll_interval: number
    config_fetch_interval: number
    updated_at: string | null
    last_fetched_at: string | null
  } | undefined

  if (!row) return Response.json({ deviceId, ...DEFAULTS, updatedAt: null, lastFetchedAt: now })

  return Response.json({
    deviceId,
    refTemp: row.ref_temp ?? DEFAULTS.refTemp,
    heaterOnOffset: row.heater_on_offset ?? DEFAULTS.heaterOnOffset,
    heaterOffOffset: row.heater_off_offset ?? DEFAULTS.heaterOffOffset,
    fanThreshold: row.fan_threshold ?? DEFAULTS.fanThreshold,
    pollInterval: row.poll_interval ?? DEFAULTS.pollInterval,
    configFetchInterval: row.config_fetch_interval ?? DEFAULTS.configFetchInterval,
    updatedAt: row.updated_at,
    lastFetchedAt: now,
  })
}

interface ConfigBody {
  refTemp?: number | null
  heaterOnOffset?: number
  heaterOffOffset?: number
  fanThreshold?: number
  pollInterval?: number
  configFetchInterval?: number
}

export async function PUT(req: NextRequest, ctx: RouteContext<'/api/sensors/config/[deviceId]'>) {
  const { deviceId } = await ctx.params
  if (!deviceId) return Response.json({ statusCode: 400, message: 'deviceId is required' }, { status: 400 })

  let body: ConfigBody = {}
  try { body = (await req.json()) ?? {} } catch {}

  const db = getDb()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO sensor_config
      (device_id, ref_temp, heater_on_offset, heater_off_offset, fan_threshold,
       poll_interval, config_fetch_interval, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      ref_temp              = excluded.ref_temp,
      heater_on_offset      = excluded.heater_on_offset,
      heater_off_offset     = excluded.heater_off_offset,
      fan_threshold         = excluded.fan_threshold,
      poll_interval         = excluded.poll_interval,
      config_fetch_interval = excluded.config_fetch_interval,
      updated_at            = excluded.updated_at
  `).run(
    deviceId,
    body.refTemp ?? null,
    body.heaterOnOffset ?? 2.0,
    body.heaterOffOffset ?? 2.0,
    body.fanThreshold ?? 10.0,
    body.pollInterval ?? 5,
    body.configFetchInterval ?? 60,
    now,
  )

  return Response.json({ ok: true })
}
