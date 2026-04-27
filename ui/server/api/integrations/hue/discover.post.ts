import { discoverBridges, pingBridge } from '../../../utils/hue'

export default defineEventHandler(async () => {
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
  return enriched
})
