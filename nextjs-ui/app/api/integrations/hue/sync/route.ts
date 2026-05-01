import { hueRuntime } from '@/lib/server/hue/runtime'

export async function POST() {
  await hueRuntime.forceSync()
  return Response.json({ ok: true })
}
