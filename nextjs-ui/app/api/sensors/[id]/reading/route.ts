import { Point } from '@influxdata/influxdb3-client'
import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'
import { getInfluxClient } from '@/lib/server/influxdb'

export async function POST(req: NextRequest, ctx: RouteContext<'/api/sensors/[id]/reading'>) {
  const { id } = await ctx.params
  const sensorId = Number(id)
  if (!sensorId) return Response.json({ statusCode: 400, message: 'invalid id' }, { status: 400 })

  let body: { value?: number; recordedAt?: number } = {}
  try { body = (await req.json()) ?? {} } catch {}
  const { value, recordedAt } = body
  if (value === undefined) return Response.json({ statusCode: 400, message: 'value is required' }, { status: 400 })

  const sensor = getDb()
    .prepare('SELECT room_id, type FROM sensors WHERE id = ?')
    .get(sensorId) as { room_id: number; type: string } | undefined

  if (!sensor) return Response.json({ statusCode: 404, message: 'sensor not found' }, { status: 404 })

  const point = Point.measurement('sensor_readings')
    .setTag('sensor_id', String(sensorId))
    .setTag('sensor_type', sensor.type)
    .setTag('room_id', String(sensor.room_id))
    .setFloatField('value', value)
    .setTimestamp(new Date(recordedAt ?? Date.now()))

  await getInfluxClient().write(point)

  return Response.json({ ok: true })
}
