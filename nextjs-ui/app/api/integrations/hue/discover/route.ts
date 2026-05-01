import { discoverBridges, pingBridge } from '@/lib/server/hue/client'

export async function POST() {
  const candidates = await discoverBridges()
  const enriched = await Promise.all(candidates.map(async c => {
    const cfg = await pingBridge(c.internalipaddress)
    return {
      id: c.id,
      ip: c.internalipaddress,
      name: cfg?.name ?? null,
      model: cfg?.modelid ?? null,
    }
  }))
  return Response.json(enriched)
}
