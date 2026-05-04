import { getSession } from '@/lib/server/session'
import { HttpError, httpErrorResponse } from '@/lib/server/errors'
import { parseSnapshot } from '@/lib/server/backup/parse'
import { assessCompatibility } from '@/lib/server/backup/compatibility'

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

    return Response.json({
      header: snapshot.header,
      warnings: [...parseWarnings, ...compat.warnings],
      errors: compat.errors,
      compatible: compat.compatible,
    })
  } catch (err) {
    return httpErrorResponse(err)
  }
}
