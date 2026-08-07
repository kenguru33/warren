import { httpErrorResponse } from '@/lib/server/errors'
import { castRuntime } from '@/lib/server/cast/runtime'
import { listTargetViews } from '@/lib/server/music'

/**
 * Trigger an immediate mDNS sweep rather than waiting for the 60s cycle.
 *
 * Responses come back asynchronously over multicast, so the target list
 * returned here may not yet include a device that is about to answer. The
 * client re-reads GET /api/music/targets shortly after.
 */
export async function POST() {
  try {
    castRuntime.sweepNow()
    return Response.json({ ok: true, targets: listTargetViews() })
  } catch (err) {
    return httpErrorResponse(err)
  }
}
