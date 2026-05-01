import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { queryInflux } from '@/lib/server/influxdb'

function toMs(t: unknown): number {
  if (typeof t === 'bigint') return Number(t / BigInt(1_000_000))
  if (t instanceof Date) return t.getTime()
  return Number(t)
}

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/sensors/[id]/history'>) {
  const id = Number((await ctx.params).id)
  if (!id) return Response.json({ statusCode: 400, message: 'Invalid sensor id' }, { status: 400 })

  const db = getDb()
  const sensor = db.prepare('SELECT device_id, type FROM sensors WHERE id = ?').get(id) as
    { device_id: string | null; type: string } | undefined

  if (!sensor) return Response.json({ statusCode: 404, message: 'Sensor not found' }, { status: 404 })
  if (!sensor.device_id) return Response.json({ readings: [] as { time: number; value: number }[] })

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const rows = await queryInflux(`
    SELECT time, value FROM sensor_readings
    WHERE device_id = '${sensor.device_id.replace(/'/g, "''")}'
      AND sensor_type = '${sensor.type.replace(/'/g, "''")}'
      AND time >= '${since}'
    ORDER BY time ASC
  `)

  return Response.json({
    readings: rows.map(r => ({
      time: toMs(r.time),
      value: Number(r.value),
    })),
  })
}
