'use client'

import useSWR from 'swr'

interface SessionResponse {
  user: { name: string } | null
}

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json())

export function useSession() {
  const { data, isLoading, mutate } = useSWR<SessionResponse>('/api/auth/session', fetcher, {
    revalidateOnFocus: false,
  })
  return {
    user: data?.user ?? null,
    loggedIn: !!data?.user,
    isLoading,
    refresh: () => mutate(),
    clear: () => mutate({ user: null }, false),
  }
}
