<script setup lang="ts">
import type { SensorType, SensorView, SensorCapabilities, LightGroupView, MasterState } from '../../shared/types'

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
  temperature: '🌡️', humidity: '💧', camera: '📷', motion: '🏃', light: '💡', lightlevel: '☀️',
}
const typeLabel: Record<string, string> = {
  temperature: 'Temperature', humidity: 'Humidity', camera: 'Camera', motion: 'Motion', light: 'Light', lightlevel: 'Light level',
}

interface EditingSensor {
  id: number
  type: string
  label: string | null
  deviceId: string | null
  capabilities?: SensorCapabilities
}
const editingSensor = ref<EditingSensor | null>(null)
const editingLabel = ref('')
const editingColor = ref<string | null>(null)
const colorError = ref<string | null>(null)

function openEditSensor(sensorId: number) {
  for (const room of rooms.value) {
    const sensor = room.sensors.find(s => s.id === sensorId)
    if (sensor) {
      editingSensor.value = {
        id: sensor.id,
        type: sensor.type,
        label: sensor.label,
        deviceId: sensor.deviceId,
        capabilities: sensor.capabilities,
      }
      editingLabel.value = sensor.label ?? ''
      editingColor.value = null
      colorError.value = null
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

async function applyLightColor(hex: string) {
  editingColor.value = hex
  colorError.value = null
  const sensor = editingSensor.value
  if (!sensor?.deviceId) return
  try {
    await $fetch(`/api/integrations/hue/lights/${encodeURIComponent(sensor.deviceId)}/state`, {
      method: 'POST',
      body: { on: true, color: hex },
    })
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    colorError.value = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'Failed to set color')
  }
}

async function onAddRoom(name: string) {
  await addRoom(name)
  showAddRoom.value = false
}

async function onAddSensor(payloads: {
  type: SensorType
  sensorId?: number
  deviceId?: string
  label: string
  streamUrl: string
  snapshotUrl: string
}[]) {
  if (!addSensorForRoom.value) return
  const roomId = addSensorForRoom.value.id
  for (const payload of payloads) {
    await addSensor({
      roomId,
      type: payload.type,
      sensorId: payload.sensorId,
      deviceId: payload.deviceId,
      label: payload.label || undefined,
      streamUrl: payload.streamUrl || undefined,
      snapshotUrl: payload.snapshotUrl || undefined,
    })
  }
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
  <div class="space-y-8">
    <!-- Page header — Catalyst Heading pattern -->
    <div class="flex flex-wrap items-end justify-between gap-4 border-b border-strong pb-5">
      <div class="max-sm:w-full sm:flex-1">
        <h1 class="text-2xl/8 font-semibold tracking-tight text-text sm:text-xl/8">
          Dashboard
        </h1>
        <p class="mt-1 text-sm/6 text-subtle">Updated {{ lastUpdated }}</p>
      </div>
      <div class="flex items-center gap-3">
        <MasterLightToggle
          v-if="globalMaster"
          :master="globalMaster"
          :pending="globalMasterPending"
          :error="globalMasterError"
          :partial="globalMasterPartial"
          label="All lights"
          @toggle="toggleGlobalMaster"
        />
        <button class="btn-primary" @click="showAddRoom = true">
          <svg class="size-4 -ml-0.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5z" /></svg>
          Add room
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="rooms.length === 0" class="rounded-xl bg-surface p-12 text-center ring-1 ring-default dark:ring-white/10">
      <div class="mx-auto flex size-12 items-center justify-center rounded-xl bg-surface-2 dark:bg-white/5">
        <svg class="size-6 text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      </div>
      <h3 class="mt-4 text-base/6 font-semibold text-text">No rooms yet</h3>
      <p class="mt-1 text-sm/6 text-subtle">Get started by creating your first room.</p>
      <div class="mt-6">
        <button class="btn-primary" @click="showAddRoom = true">Add your first room</button>
      </div>
    </div>

    <!-- Room grid -->
    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-6">
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

  <AppDialog v-if="editingSensor" :open="true" max-width-class="max-w-md" @close="editingSensor = null">
    <div class="p-6 space-y-4">
      <div class="flex items-center gap-3">
        <span class="text-2xl">{{ typeIcon[editingSensor.type] ?? '?' }}</span>
        <h3 class="text-base font-semibold text-text">{{ typeLabel[editingSensor.type] || editingSensor.type }}</h3>
      </div>
      <div>
        <label class="label">Label</label>
        <input
          v-model="editingLabel"
          class="input mt-2"
          placeholder="Custom label…"
          maxlength="60"
          autofocus
          @keydown.enter="saveSensorLabel"
          @keydown.escape="editingSensor = null"
        />
      </div>
      <div v-if="editingSensor.type === 'light' && editingSensor.capabilities?.color">
        <label class="label">Color</label>
        <div class="mt-2">
          <LightColorPicker :model-value="editingColor" @update:model-value="applyLightColor" />
        </div>
        <p v-if="colorError" class="mt-2 rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-xs text-error">{{ colorError }}</p>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button class="btn-secondary" @click="editingSensor = null">Cancel</button>
        <button class="btn-primary" @click="saveSensorLabel">Save</button>
      </div>
    </div>
  </AppDialog>
</template>
