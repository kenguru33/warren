import { hueRuntime } from '../utils/hue-runtime'

export default defineNitroPlugin(() => {
  hueRuntime.start()
})
