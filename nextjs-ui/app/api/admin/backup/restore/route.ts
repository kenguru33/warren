import { getDb } from '@/lib/server/db'
import { getSession } from '@/lib/server/session'
import { HttpError, httpErrorResponse } from '@/lib/server/errors'
import { parseSnapshot } from '@/lib/server/backup/parse'
import { assessCompatibility } from '@/lib/server/backup/compatibility'
import { restoreSnapshot } from '@/lib/server/backup/restore'
import { hueRuntime } from '@/lib/server/hue/runtime'
import { startMqtt, stopMqtt } from '@/lib/server/mqtt'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session.user) {
    return Response.json({ statusCode: 401, statusMessage: 'Unauthorized' }, { status: 401 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      throw new HttpError(400, 'Missing "file" field in multipart upload.')
    }

    const text = await file.text()
    const { snapshot, warnings: parseWarnings } = parseSnapshot(text)
    const compat = assessCompatibility(snapshot)
    if (!compat.compatible) {
      throw new HttpError(422, compat.errors[0] ?? 'Snapshot is not compatible.', {
        warnings: [...parseWarnings, ...compat.warnings],
        errors: compat.errors,
      })
    }

    hueRuntime.stop()
    stopMqtt()

    const result = restoreSnapshot(getDb(), snapshot, {
      preserveUsername: session.user.name,
    })

    hueRuntime.restart()
    startMqtt()

    return Response.json({
      ok: true,
      rowCounts: result.rowCounts,
      preservedUser: result.preservedUser,
      warnings: [...parseWarnings, ...compat.warnings],
    })
  } catch (err) {
    return httpErrorResponse(err)
  }
}
