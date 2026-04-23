<script setup lang="ts">
import type { SensorType, SensorView } from '../../shared/types'

const {
  rooms,
  lastUpdated,
  addRoom,
  removeRoom,
  renameRoom,
  saveReference,
  addSensor,
  removeSensor,
  activeSensorId,
  activeCameraContext,
} = useRooms()

const showAddRoom = ref(false)
const addSensorForRoom = ref<{ id: number; name: string } | null>(null)
const historyTarget = ref<{ sensor: SensorView; roomName: string } | null>(null)

async function onAddRoom(name: string) {
  await addRoom(name)
  showAddRoom.value = false
}

async function onAddSensor(payload: {
  type: SensorType
  sensorId?: number
  deviceId?: string
  label: string
  streamUrl: string
  snapshotUrl: string
}) {
  if (!addSensorForRoom.value) return
  await addSensor({
    roomId: addSensorForRoom.value.id,
    type: payload.type,
    sensorId: payload.sensorId,
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
    <div class="toolbar">
      <span class="last-updated">Updated {{ lastUpdated }}</span>
      <button class="btn-add-room" @click="showAddRoom = true">+ Add room</button>
    </div>

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
        @remove-room="removeRoom"
        @rename-room="(id, name) => renameRoom(id, name)"
        @remove-sensor="removeSensor"
        @add-sensor="id => addSensorForRoom = rooms.find(r => r.id === id) ?? null"
        @open-live="id => activeSensorId = id"
        @view-history="sensor => historyTarget = { sensor, roomName: room.name }"
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

    <SensorHistoryModal
      v-if="historyTarget"
      :sensor="historyTarget.sensor"
      :room-name="historyTarget.roomName"
      @close="historyTarget = null"
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
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
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
  grid-template-columns: repeat(auto-fill, minmax(340px, 560px));
  gap: 16px;
}
</style>
