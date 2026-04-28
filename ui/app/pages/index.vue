<script setup lang="ts">
import type { SensorType, SensorView, LightGroupView, MasterState } from '../../shared/types'

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
  refresh,
} = useRooms()

const showAddRoom = ref(false)
const addSensorForRoom = ref<{ id: number; name: string } | null>(null)
const historyTarget = ref<{ sensor: SensorView; roomName: string } | null>(null)

const typeIcon: Record<string, string> = {
  temperature: '🌡️', humidity: '💧', camera: '📷', motion: '🏃',
}
const typeLabel: Record<string, string> = {
  temperature: 'Temperature', humidity: 'Humidity', camera: 'Camera', motion: 'Motion',
}

const editingSensor = ref<{ id: number; type: string; label: string | null } | null>(null)
const editingLabel = ref('')

function openEditSensor(sensorId: number) {
  for (const room of rooms.value) {
    const sensor = room.sensors.find(s => s.id === sensorId)
    if (sensor) {
      editingSensor.value = { id: sensor.id, type: sensor.type, label: sensor.label }
      editingLabel.value = sensor.label ?? ''
      return
    }
  }
}

async function saveSensorLabel() {
  const sensor = editingSensor.value
  if (!sensor) return
  await $fetch(`/api/sensors/${sensor.id}`, { method: 'PATCH', body: { label: editingLabel.value.trim() || null } })
  editingSensor.value = null
  await refresh()
}

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

// Light group editing state
const groupEdit = ref<{ roomId: number; group: LightGroupView | null } | null>(null)

function openCreateGroup(roomId: number) {
  groupEdit.value = { roomId, group: null }
}

function openEditGroup(groupId: number) {
  for (const room of rooms.value) {
    const group = (room.lightGroups ?? []).find(g => g.id === groupId)
    if (group) {
      groupEdit.value = { roomId: room.id, group }
      return
    }
  }
}

const groupEditRoom = computed(() => {
  if (!groupEdit.value) return null
  return rooms.value.find(r => r.id === groupEdit.value!.roomId) ?? null
})

const groupEditLights = computed<SensorView[]>(() => {
  return groupEditRoom.value?.sensors.filter(s => s.type === 'light') ?? []
})

const groupEditGroups = computed<LightGroupView[]>(() => {
  return groupEditRoom.value?.lightGroups ?? []
})

async function onGroupSaved() {
  groupEdit.value = null
  await refresh()
}

async function onUngroup(groupId: number) {
  await $fetch(`/api/light-groups/${groupId}`, { method: 'DELETE' })
  await refresh()
}

// Global master switch
const { data: globalMaster, refresh: refreshGlobalMaster } = useFetch<MasterState | null>(
  '/api/lights/master-state',
  { default: () => null },
)
const globalMasterPending = ref(false)
const globalMasterError = ref<string | null>(null)
const globalMasterPartial = ref<{ ok: number; failed: number } | null>(null)

async function toggleGlobalMaster(nextOn: boolean) {
  if (globalMasterPending.value) return
  globalMasterPending.value = true
  globalMasterError.value = null
  globalMasterPartial.value = null
  try {
    const res = await $fetch<{ successCount: number; failureCount: number; total: number }>(
      '/api/lights/master-state',
      { method: 'POST', body: { on: nextOn } },
    )
    if (res.failureCount > 0) {
      globalMasterPartial.value = { ok: res.successCount, failed: res.failureCount }
    }
    await Promise.all([refresh(), refreshGlobalMaster()])
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    globalMasterError.value = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed')
  } finally {
    globalMasterPending.value = false
  }
}

async function onRoomMasterToggled() {
  await Promise.all([refresh(), refreshGlobalMaster()])
}
</script>

<template>
  <div class="dashboard">
    <div class="toolbar">
      <MasterLightToggle
        v-if="globalMaster"
        class="global-master"
        :master="globalMaster"
        :pending="globalMasterPending"
        :error="globalMasterError"
        :partial="globalMasterPartial"
        label="All lights"
        @toggle="toggleGlobalMaster"
      />
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
        @edit-sensor="openEditSensor"
        @add-group="openCreateGroup"
        @edit-group="openEditGroup"
        @ungroup="onUngroup"
        @master-toggled="onRoomMasterToggled"
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

    <LightGroupModal
      v-if="groupEdit && groupEditRoom"
      :room-id="groupEditRoom.id"
      :room-name="groupEditRoom.name"
      :lights="groupEditLights"
      :group="groupEdit.group"
      :groups-in-room="groupEditGroups"
      @close="groupEdit = null"
      @saved="onGroupSaved"
      @deleted="onGroupSaved"
    />
  </div>

  <Teleport to="body">
    <div v-if="editingSensor" class="modal-overlay" @click.self="editingSensor = null">
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-icon">{{ typeIcon[editingSensor.type] ?? '?' }}</span>
          <div class="modal-title">{{ typeLabel[editingSensor.type] || editingSensor.type }}</div>
        </div>
        <label class="modal-field">
          <span>Label</span>
          <input
            v-model="editingLabel"
            class="modal-input"
            placeholder="Custom label…"
            maxlength="60"
            autofocus
            @keydown.enter="saveSensorLabel"
            @keydown.escape="editingSensor = null"
          />
        </label>
        <div class="modal-actions">
          <button class="btn-cancel" @click="editingSensor = null">Cancel</button>
          <button class="btn-save" @click="saveSensorLabel">Save</button>
        </div>
      </div>
    </div>
  </Teleport>
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

.global-master {
  margin-right: auto;
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

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 24px;
}

.modal-card {
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-icon { font-size: 1.6rem; }

.modal-title {
  font-size: 1rem;
  font-weight: 700;
  color: #e2e8f0;
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
  color: #94a3b8;
}

.modal-input {
  background: #0f1117;
  border: 1px solid #2a2f45;
  border-radius: 8px;
  padding: 9px 12px;
  color: #e2e8f0;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s;
}

.modal-input:focus { border-color: #4a6fa5; }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel {
  background: none;
  color: #64748b;
  border: 1px solid #2a2f45;
  border-radius: 8px;
  padding: 7px 16px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: color 0.15s;
}

.btn-cancel:hover { color: #94a3b8; }

.btn-save {
  background: #4a6fa5;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 7px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-save:hover { background: #6b93c7; }

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
  grid-template-columns: repeat(auto-fill, minmax(300px, 420px));
  gap: 16px;
}
</style>
