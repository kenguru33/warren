import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, unsealSessionCookie } from '@/lib/server/session'

const PUBLIC_EXACT = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/session',
  '/api/sensors/announce',
])

const PUBLIC_PREFIXES = ['/api/sensors/config/']
const PUBLIC_PATTERNS = [/^\/api\/sensors\/[^/]+\/reading$/]

function isPublicApi(path: string): boolean {
  if (PUBLIC_EXACT.has(path)) return true
  if (PUBLIC_PREFIXES.some(p => path.startsWith(p))) return true
  if (PUBLIC_PATTERNS.some(re => re.test(path))) return true
  return false
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  if (path.startsWith('/api/')) {
    if (isPublicApi(path)) return NextResponse.next()
    const cookie = request.cookies.get(SESSION_COOKIE)?.value
    const session = await unsealSessionCookie(cookie)
    if (!session?.user) {
      return NextResponse.json(
        { statusCode: 401, statusMessage: 'Unauthorized' },
        { status: 401 },
      )
    }
    return NextResponse.next()
  }

  if (path === '/login') return NextResponse.next()

  const cookie = request.cookies.get(SESSION_COOKIE)?.value
  const session = await unsealSessionCookie(cookie)
  if (!session?.user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next|favicon|manifest|sw\\.js|icons|robots\\.txt).*)',
  ],
}
