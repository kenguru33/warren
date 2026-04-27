import { hueRuntime } from '../../../utils/hue-runtime'

export default defineEventHandler(async () => {
  await hueRuntime.forceSync()
  return { ok: true }
})
