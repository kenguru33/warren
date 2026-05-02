'use client'

import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import type { RoomReference, RoomWithSensors, SensorType } from '@/lib/shared/types'

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return res.json()
}

export function useRooms() {
  const router = useRouter()
  const { data, mutate } = useSWR<RoomWithSensors[]>('/api/rooms', fetcher, {
    refreshInterval: 5000,
    fallbackData: [],
    onError(err: Error & { status?: number }) {
      if (err.status === 401) router.push('/login')
    },
  })

  const rooms = data ?? []

  const refresh = useCallback(() => mutate(), [mutate])

  const addRoom = useCallback(async (name: string) => {
    await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    })
    await mutate()
  }, [mutate])

  const removeRoom = useCallback(async (id: number) => {
    await fetch(`/api/rooms/${id}`, { method: 'DELETE', credentials: 'include' })
    await mutate()
  }, [mutate])

  const renameRoom = useCallback(async (id: number, name: string) => {
    await fetch(`/api/rooms/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    })
    await mutate()
  }, [mutate])

  const saveReference = useCallback(async (roomId: number, ref: RoomReference) => {
    await fetch(`/api/rooms/${roomId}/reference`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(ref),
    })
    await mutate()
  }, [mutate])

  const clearReference = useCallback(async (roomId: number) => {
    await fetch(`/api/rooms/${roomId}/reference`, { method: 'DELETE', credentials: 'include' })
    await mutate()
  }, [mutate])

  const addSensor = useCallback(async (payload: {
    roomId: number
    type: SensorType
    sensorId?: number
    deviceId?: string
    label?: string
    streamUrl?: string
    snapshotUrl?: string
  }) => {
    await fetch('/api/sensors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    await mutate()
  }, [mutate])

  const removeSensor = useCallback(async (sensorId: number) => {
    const room = rooms.find(r => r.sensors.some(s => s.id === sensorId))
    if (room) {
      await fetch(`/api/rooms/${room.id}/sensors/${sensorId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
    }
    await mutate()
  }, [rooms, mutate])

  const renameSensor = useCallback(async (sensorId: number, label: string) => {
    await fetch(`/api/sensors/${sensorId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ label: label.trim() || null }),
    })
    await mutate()
  }, [mutate])

  const renameLightGroup = useCallback(async (groupId: number, name: string) => {
    await fetch(`/api/light-groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: name.trim() }),
    })
    await mutate()
  }, [mutate])

  const hideSensor = useCallback(async (sensorId: number) => {
    // Look up the sensor's deviceId + type so the block API can find it again
    // even after we've detached it from any room.
    const sensor = rooms.flatMap(r => r.sensors).find(s => s.id === sensorId)
    if (!sensor?.deviceId) return
    await fetch('/api/sensors/block', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ deviceId: sensor.deviceId, type: sensor.type }),
    })
    await mutate()
  }, [rooms, mutate])

  const lastUpdated = useMemo(
    () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    [data],
  )

  return {
    rooms,
    lastUpdated,
    addRoom,
    removeRoom,
    renameRoom,
    saveReference,
    clearReference,
    addSensor,
    removeSensor,
    hideSensor,
    renameSensor,
    renameLightGroup,
    refresh,
  }
}
