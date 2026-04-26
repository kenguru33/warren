const PUBLIC_EXACT = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/_auth/session',
  '/api/sensors/announce',
])

const PUBLIC_PREFIXES = ['/api/sensors/config/']
const PUBLIC_PATTERNS = [/^\/api\/sensors\/[^/]+\/reading$/]

function isPublic(path: string) {
  if (PUBLIC_EXACT.has(path)) return true
  if (PUBLIC_PREFIXES.some(p => path.startsWith(p))) return true
  if (PUBLIC_PATTERNS.some(re => re.test(path))) return true
  return false
}

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0] ?? ''
  if (!path.startsWith('/api/')) return
  if (isPublic(path)) return

  const session = await getUserSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
})
