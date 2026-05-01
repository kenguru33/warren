import { getIronSession, sealData, unsealData, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  user?: { name: string }
}

export const SESSION_COOKIE = 'warren-session'

function getSessionPassword(): string {
  const pw = process.env.WARREN_SESSION_PASSWORD ?? ''
  if (pw.length < 32) {
    throw new Error('WARREN_SESSION_PASSWORD must be set and at least 32 characters')
  }
  return pw
}

export function getSessionOptions(): SessionOptions {
  return {
    password: getSessionPassword(),
    cookieName: SESSION_COOKIE,
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    },
  }
}

export async function getSession() {
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, getSessionOptions())
}

export async function setSession(user: { name: string }) {
  const session = await getSession()
  session.user = user
  await session.save()
}

export async function clearSession() {
  const session = await getSession()
  session.destroy()
}

export async function unsealSessionCookie(cookieValue: string | undefined): Promise<SessionData | null> {
  if (!cookieValue) return null
  try {
    const data = await unsealData<SessionData>(cookieValue, { password: getSessionPassword() })
    return data ?? null
  } catch {
    return null
  }
}

export async function sealSession(data: SessionData): Promise<string> {
  return sealData(data, { password: getSessionPassword() })
}
