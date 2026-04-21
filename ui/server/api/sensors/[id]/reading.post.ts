import { Point } from '@influxdata/influxdb3-client'
import { getDb } from '../../../utils/db'
import { getInfluxClient } from '../../../utils/influxdb'

export default defineEventHandler(async (event) => {
  const sensorId = Number(getRouterParam(event, 'id'))
  const { value, recordedAt } = await readBody<{ value: number; recordedAt?: number }>(event)

  if (!sensorId) throw createError({ statusCode: 400, message: 'invalid id' })
  if (value === undefined) throw createError({ statusCode: 400, message: 'value is required' })

  const sensor = getDb()
    .prepare('SELECT room_id, type FROM sensors WHERE id = ?')
    .get(sensorId) as { room_id: number; type: string } | undefined

  if (!sensor) throw createError({ statusCode: 404, message: 'sensor not found' })

  const point = Point.measurement('sensor_readings')
    .tag('sensor_id', String(sensorId))
    .tag('sensor_type', sensor.type)
    .tag('room_id', String(sensor.room_id))
    .floatField('value', value)
    .timestamp(new Date(recordedAt ?? Date.now()))

  await getInfluxClient().write(point)

  return { ok: true }
})
