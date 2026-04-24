import { getDb } from '../../../utils/db'
import { queryInflux } from '../../../utils/influxdb'

function toMs(t: unknown): number {
  if (typeof t === 'bigint') return Number(t / BigInt(1_000_000))
  if (t instanceof Date) return t.getTime()
  return Number(t)
}

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, message: 'Invalid sensor id' })

  const db = getDb()
  const sensor = db.prepare('SELECT device_id, type FROM sensors WHERE id = ?').get(id) as
    { device_id: string | null; type: string } | undefined

  if (!sensor) throw createError({ statusCode: 404, message: 'Sensor not found' })
  if (!sensor.device_id) return { readings: [] as { time: number; value: number }[] }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const rows = await queryInflux(`
    SELECT time, value FROM sensor_readings
    WHERE device_id = '${sensor.device_id.replace(/'/g, "''")}'
      AND sensor_type = '${sensor.type.replace(/'/g, "''")}'
      AND time >= '${since}'
    ORDER BY time ASC
  `)

  return {
    readings: rows.map(r => ({
      time: toMs(r.time),
      value: Number(r.value),
    })),
  }
})
