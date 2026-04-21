import type { RoomWithSensors, RoomReference, SensorType, SensorView } from '../../shared/types'

export function useRooms() {
  const { data, refresh } = useFetch<RoomWithSensors[]>('/api/rooms', { default: () => [] })
  const rooms = data as Ref<RoomWithSensors[]>

  const lastUpdated = ref(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))

  async function poll() {
    await refresh()
    lastUpdated.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  onMounted(() => {
    const intervalId = setInterval(poll, 5000)
    onUnmounted(() => clearInterval(intervalId))
  })

  async function addRoom(name: string) {
    await $fetch('/api/rooms', { method: 'POST', body: { name } })
    await refresh()
    lastUpdated.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  async function removeRoom(id: number) {
    await $fetch(`/api/rooms/${id}`, { method: 'DELETE' })
    await poll()
  }

  async function saveReference(roomId: number, ref: RoomReference) {
    await $fetch(`/api/rooms/${roomId}/reference`, { method: 'PUT', body: ref })
    const room = rooms.value.find(r => r.id === roomId)
    if (room) room.reference = ref
  }

  async function clearReference(roomId: number) {
    await $fetch(`/api/rooms/${roomId}/reference`, { method: 'PUT', body: { refTemp: 21, refHumidity: 50 } })
    const room = rooms.value.find(r => r.id === roomId)
    if (room) room.reference = null
  }

  async function addSensor(payload: {
    roomId: number
    type: SensorType
    deviceId?: string
    label?: string
    streamUrl?: string
    snapshotUrl?: string
  }) {
    await $fetch('/api/sensors', { method: 'POST', body: payload })
    await poll()
  }

  async function removeSensor(sensorId: number) {
    await $fetch(`/api/sensors/${sensorId}`, { method: 'DELETE' })
    rooms.value.forEach(room => {
      room.sensors = room.sensors.filter(s => s.id !== sensorId)
    })
  }

  // Live stream modal state
  const activeSensorId = ref<number | null>(null)

  const activeCameraContext = computed<{ sensor: SensorView; roomName: string } | null>(() => {
    if (activeSensorId.value === null) return null
    for (const room of rooms.value) {
      const sensor = room.sensors.find(s => s.id === activeSensorId.value)
      if (sensor) return { sensor, roomName: room.name }
    }
    return null
  })

  return {
    rooms,
    lastUpdated,
    addRoom,
    removeRoom,
    saveReference,
    clearReference,
    addSensor,
    removeSensor,
    activeSensorId,
    activeCameraContext,
    refresh,
  }
}
