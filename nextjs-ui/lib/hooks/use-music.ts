'use client'

import useSWR from 'swr'
import { useCallback } from 'react'
import type { MusicSourceView, MusicTargetView, MusicView, SonosFavoriteView } from '@/lib/shared/types'

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let payload: { message?: string; data?: { error?: string } } = {}
    try { payload = await res.json() } catch { /* non-JSON error body */ }
    const err = new Error(payload.message ?? `HTTP ${res.status}`) as Error & { code?: string }
    err.code = payload.data?.error
    throw err
  }
  return res.json().catch(() => null)
}

/**
 * Cast targets, shared by the whole house. Refreshed on a slow cycle — mDNS
 * results arrive asynchronously, so a freshly powered-on speaker shows up
 * within a sweep rather than instantly.
 */
export function useMusicTargets() {
  const { data, mutate } = useSWR<MusicTargetView[]>('/api/music/targets', fetcher, {
    refreshInterval: 30_000,
    fallbackData: [],
  })

  const discover = useCallback(async () => {
    await send('/api/music/targets/discover', 'POST')
    // Answers trickle in over multicast; re-read shortly after the sweep.
    setTimeout(() => { void mutate() }, 1500)
    await mutate()
  }, [mutate])

  const addManualTarget = useCallback(async (address: string, friendlyName?: string) => {
    await send('/api/music/targets', 'POST', { address, friendlyName })
    await mutate()
  }, [mutate])

  const removeTarget = useCallback(async (targetId: string) => {
    await send(`/api/music/targets/${encodeURIComponent(targetId)}`, 'DELETE')
    await mutate()
  }, [mutate])

  return { targets: data ?? [], discover, addManualTarget, removeTarget, refreshTargets: mutate }
}

/**
 * Sonos Favorites for a target, fetched only when the selected output is a
 * Sonos speaker. Not part of the music payload because the list belongs to the
 * Sonos app rather than to Warren, and is read live every time it is shown.
 */
export function useSonosFavorites(targetId: string | null) {
  const { data, error, isLoading } = useSWR<SonosFavoriteView[]>(
    targetId ? `/api/music/targets/${encodeURIComponent(targetId)}/favorites` : null,
    fetcher,
  )
  return {
    favorites: data ?? [],
    favoritesError: error instanceof Error ? error.message : null,
    favoritesLoading: isLoading,
  }
}

/**
 * The music player: one library, one output, one playback state for the whole
 * house. Polls its own state because — unlike the per-room player this replaced
 * — it no longer rides along on the `useRooms` payload.
 */
export function useMusic() {
  const { data, mutate } = useSWR<MusicView>('/api/music', fetcher, {
    refreshInterval: 5_000,
  })

  const onChanged = useCallback(() => { void mutate() }, [mutate])

  const enableMusic = useCallback(async (preferredTargetId: string | null = null) => {
    await send('/api/music', 'PUT', { preferredTargetId })
    onChanged()
  }, [onChanged])

  const removeMusic = useCallback(async () => {
    await send('/api/music', 'DELETE')
    onChanged()
  }, [onChanged])

  const setTarget = useCallback(async (preferredTargetId: string | null) => {
    await send('/api/music', 'PUT', { preferredTargetId })
    onChanged()
  }, [onChanged])

  const addSource = useCallback(async (url: string, name: string): Promise<MusicSourceView> => {
    const created = await send('/api/music/sources', 'POST', { url, name })
    onChanged()
    return created as MusicSourceView
  }, [onChanged])

  const patchSource = useCallback(async (
    sourceId: number,
    patch: { name?: string; isDefault?: boolean; position?: number },
  ) => {
    await send(`/api/music/sources/${sourceId}`, 'PATCH', patch)
    onChanged()
  }, [onChanged])

  const deleteSource = useCallback(async (sourceId: number) => {
    await send(`/api/music/sources/${sourceId}`, 'DELETE')
    onChanged()
  }, [onChanged])

  /** Transport commands. For the browser target the server returns intent only. */
  const command = useCallback(async (
    command: string,
    extra: { sourceId?: number; favoriteId?: string; positionMs?: number; volume?: number } = {},
  ) => {
    const result = await send('/api/music/command', 'POST', { command, ...extra })
    onChanged()
    return result as { target?: string; command?: string; source?: MusicSourceView } | null
  }, [onChanged])

  return {
    music: data ?? null,
    refreshMusic: onChanged,
    enableMusic, removeMusic, setTarget, addSource, patchSource, deleteSource, command,
  }
}
