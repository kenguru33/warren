export class HttpError extends Error {
  statusCode: number
  data?: unknown
  constructor(statusCode: number, message: string, data?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.data = data
    this.name = 'HttpError'
  }
}

export function httpErrorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    const body: Record<string, unknown> = {
      statusCode: err.statusCode,
      statusMessage: err.message,
      message: err.message,
    }
    if (err.data !== undefined) body.data = err.data
    return Response.json(body, { status: err.statusCode })
  }
  console.error('[api] unhandled error:', err)
  return Response.json(
    { statusCode: 500, statusMessage: 'Internal Server Error' },
    { status: 500 },
  )
}
