'use client'

import useSWR from 'swr'
import { useCallback } from 'react'
import type { WeatherView } from '@/lib/shared/types'

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
    const payload = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(payload.message ?? `HTTP ${res.status}`)
  }
  return res.json().catch(() => null)
}

/**
 * Outdoor weather. Polled slowly on purpose: the server holds the cache and
 * only asks MET when the forecast has actually expired, so a fast client poll
 * would add load without adding freshness.
 */
export function useWeather() {
  const { data, mutate } = useSWR<WeatherView>('/api/weather', fetcher, {
    refreshInterval: 300_000,
  })

  const setLocation = useCallback(async (
    latitude: number, longitude: number, label?: string,
  ) => {
    const updated = await send('/api/weather', 'PUT', { latitude, longitude, label })
    await mutate(updated as WeatherView, { revalidate: false })
  }, [mutate])

  const clearLocation = useCallback(async () => {
    await send('/api/weather', 'DELETE')
    await mutate()
  }, [mutate])

  const refresh = useCallback(async () => {
    const updated = await send('/api/weather/refresh', 'POST')
    await mutate(updated as WeatherView, { revalidate: false })
  }, [mutate])

  return { weather: data ?? null, setLocation, clearLocation, refresh }
}
