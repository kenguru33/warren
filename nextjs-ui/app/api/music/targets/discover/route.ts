import { httpErrorResponse } from '@/lib/server/errors'
import { castRuntime } from '@/lib/server/cast/runtime'
import { sonosRuntime } from '@/lib/server/sonos/runtime'
import { listTargetViews } from '@/lib/server/music'

/**
 * Trigger an immediate discovery sweep rather than waiting for the 60s cycle.
 * Sweeps both protocols: mDNS for Cast, SSDP for Sonos.
 *
 * Responses come back asynchronously over multicast, so the target list
 * returned here may not yet include a device that is about to answer. The
 * client re-reads GET /api/music/targets shortly after.
 */
export async function POST() {
  try {
    castRuntime.sweepNow()
    // Sonos is awaited because its sweep writes rows synchronously once the
    // manager answers; a failure in one protocol must not stop the other.
    await sonosRuntime.sweepNow().catch(err => console.error('[sonos] sweep failed:', err))
    return Response.json({ ok: true, targets: listTargetViews() })
  } catch (err) {
    return httpErrorResponse(err)
  }
}
