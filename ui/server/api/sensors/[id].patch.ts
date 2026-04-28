import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ label?: string | null }>(event)

  const db = getDb()
  const sensor = db.prepare('SELECT device_id FROM sensors WHERE id = ?').get(id) as { device_id: string | null } | undefined
  if (!sensor) throw createError({ statusCode: 404, message: 'sensor not found' })

  if (sensor.device_id?.startsWith('hue-')) {
    throw createError({
      statusCode: 400,
      message: 'hue_use_rename_endpoint',
      data: { code: 'hue_use_rename_endpoint' },
    })
  }

  db.prepare('UPDATE sensors SET label = ? WHERE id = ?').run(body.label ?? null, id)
  return { ok: true }
})
