import { getDb } from '@/lib/server/db'
import { hueRuntime } from '@/lib/server/hue/runtime'

export async function DELETE() {
  hueRuntime.stop()

  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM sensors WHERE device_id LIKE 'hue-%'`).run()
    db.prepare(`DELETE FROM blocked_sensors WHERE device_id LIKE 'hue-%'`).run()
    db.prepare('DELETE FROM hue_light_state').run()
    db.prepare('DELETE FROM hue_devices').run()
    db.prepare('DELETE FROM hue_bridge').run()
  })
  tx()

  return Response.json({ ok: true })
}
