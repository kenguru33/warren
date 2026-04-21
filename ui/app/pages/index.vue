<script setup lang="ts">
import type { SensorType } from '../../shared/types'

const {
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
} = useRooms()

const showAddRoom = ref(false)
const addSensorForRoom = ref<{ id: number; name: string } | null>(null)

async function onAddRoom(name: string) {
  await addRoom(name)
  showAddRoom.value = false
}

async function onAddSensor(payload: {
  type: SensorType
  deviceId?: string
  label: string
  streamUrl: string
  snapshotUrl: string
}) {
  if (!addSensorForRoom.value) return
  await addSensor({
    roomId: addSensorForRoom.value.id,
    type: payload.type,
    deviceId: payload.deviceId,
    label: payload.label || undefined,
    streamUrl: payload.streamUrl || undefined,
    snapshotUrl: payload.snapshotUrl || undefined,
  })
  addSensorForRoom.value = null
}
</script>

<template>
  <div class="dashboard">
    <header class="header">
      <div>
        <h1 class="title">HomeNut</h1>
        <p class="subtitle">Home Overview</p>
      </div>
      <div class="header-right">
        <span class="last-updated">Updated {{ lastUpdated }}</span>
        <button class="btn-add-room" @click="showAddRoom = true">+ Add room</button>
      </div>
    </header>

    <!-- Empty state -->
    <div v-if="rooms.length === 0" class="empty">
      <p>No rooms yet.</p>
      <button class="btn-add-room" @click="showAddRoom = true">Add your first room</button>
    </div>

    <!-- Room grid -->
    <div v-else class="grid">
      <RoomCard
        v-for="room in rooms"
        :key="room.id"
        :room="room"
        @save-ref="(id, t, h) => saveReference(id, { refTemp: t, refHumidity: h })"
        @clear-ref="clearReference"
        @remove-room="removeRoom"
        @remove-sensor="removeSensor"
        @add-sensor="id => addSensorForRoom = rooms.find(r => r.id === id) ?? null"
        @open-live="id => activeSensorId = id"
      />
    </div>

    <!-- Modals -->
    <AddRoomModal
      v-if="showAddRoom"
      @add="onAddRoom"
      @close="showAddRoom = false"
    />

    <AddSensorModal
      v-if="addSensorForRoom"
      :room-name="addSensorForRoom.name"
      @add="onAddSensor"
      @close="addSensorForRoom = null"
    />

    <LiveStreamModal
      v-if="activeCameraContext"
      :camera-name="`${activeCameraContext.roomName} — ${activeCameraContext.sensor.label ?? 'Camera'}`"
      :stream-url="activeCameraContext.sensor.streamUrl"
      @close="activeSensorId = null"
    />
  </div>
</template>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #0f1117;
  color: #e2e8f0;
  font-family: system-ui, -apple-system, sans-serif;
  min-height: 100vh;
}
</style>

<style scoped>
.dashboard {
  max-width: 1100px;
  margin: 0 auto;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.title {
  font-size: 2rem;
  font-weight: 800;
  color: #f1f5f9;
}

.subtitle {
  font-size: 0.9rem;
  color: #64748b;
  margin-top: 4px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.last-updated {
  font-size: 0.8rem;
  color: #475569;
}

.btn-add-room {
  background: #4a6fa5;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-add-room:hover { background: #6b93c7; }

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 80px 0;
  color: #475569;
  font-size: 0.95rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
</style>
