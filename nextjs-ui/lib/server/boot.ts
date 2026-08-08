// Single boot orchestrator invoked from instrumentation.ts.
// Idempotent: HMR/restart-safe via globalThis flag.

import { initDb } from './db'
import { startMqtt, stopMqtt } from './mqtt'
import { hueRuntime } from './hue/runtime'
import { castRuntime } from './cast/runtime'
import { sonosRuntime } from './sonos/runtime'

declare global {
  // eslint-disable-next-line no-var
  var __warren_booted: boolean | undefined
}

export function bootServer() {
  if (globalThis.__warren_booted) return
  globalThis.__warren_booted = true

  initDb()
  startMqtt()
  hueRuntime.start()
  castRuntime.start()
  sonosRuntime.start()

  const shutdown = (sig: string) => {
    console.log(`[boot] received ${sig}, shutting down`)
    try { sonosRuntime.stop() } catch {}
    try { castRuntime.stop() } catch {}
    try { hueRuntime.stop() } catch {}
    try { stopMqtt() } catch {}
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))

  console.log('[boot] warren server initialized')
}
