<script setup lang="ts">
import type { RoomWithSensors, SensorView } from '../../shared/types'

const props = defineProps<{ room: RoomWithSensors }>()

const emit = defineEmits<{
  (e: 'save-ref', roomId: number, refTemp: number | null, refHumidity: number | null): void
  (e: 'remove-room', roomId: number): void
  (e: 'remove-sensor', sensorId: number): void
  (e: 'rename-room', roomId: number, name: string): void
  (e: 'add-sensor', roomId: number): void
  (e: 'open-live', sensorId: number): void
  (e: 'view-history', sensor: SensorView): void
  (e: 'edit-sensor', sensorId: number): void
  (e: 'add-group', roomId: number): void
  (e: 'edit-group', groupId: number): void
  (e: 'ungroup', groupId: number): void
  (e: 'master-toggled'): void
}>()

const tempSensor    = computed(() => props.room.sensors.find(s => s.type === 'temperature') ?? null)
const humSensor     = computed(() => props.room.sensors.find(s => s.type === 'humidity')    ?? null)
const motionSensor  = computed(() => props.room.sensors.find(s => s.type === 'motion')      ?? null)
const cameras       = computed(() => props.room.sensors.filter(s => s.type === 'camera'))
const lights        = computed(() => props.room.sensors.filter(s => s.type === 'light'))
const ungroupedLights = computed(() => lights.value.filter(l => !l.groupId))
const hasClimate    = computed(() => tempSensor.value || humSensor.value)
const lightGroups   = computed(() => props.room.lightGroups ?? [])
const lightsById    = computed(() => new Map(lights.value.map(l => [l.id, l])))

const hasAmbient = computed(() => !!(tempSensor.value || humSensor.value || motionSensor.value))
const hasCamera  = computed(() => cameras.value.length > 0)
const hasLighting = computed(() => lightGroups.value.length > 0 || ungroupedLights.value.length > 0)
const hasAnyContent = computed(() => hasAmbient.value || hasCamera.value || hasLighting.value)

const editing        = ref(false)
const refTempEnabled = ref(props.room.reference !== null && props.room.reference.refTemp !== null)
const refHumEnabled  = ref(props.room.reference !== null && props.room.reference.refHumidity !== null)
const refTemp        = ref(props.room.reference?.refTemp     ?? 21)
const refHumidity    = ref(props.room.reference?.refHumidity ?? 50)
const editName       = ref(props.room.name)

const confirmRoom   = ref(false)
const detailGroupId = ref<number | null>(null)

const detailGroup = computed(() => {
  if (detailGroupId.value === null) return null
  return lightGroups.value.find(g => g.id === detailGroupId.value) ?? null
})

const detailGroupMembers = computed<SensorView[]>(() => {
  const g = detailGroup.value
  if (!g) return []
  return g.memberSensorIds
    .map(id => lightsById.value.get(id))
    .filter((s): s is SensorView => !!s)
})

// Master switch state — optimistic on tap, reconciles with next /api/rooms refresh.
const masterPending = ref(false)
const masterError = ref<string | null>(null)
const masterPartial = ref<{ ok: number; failed: number } | null>(null)

async function toggleRoomMaster(nextOn: boolean) {
  if (masterPending.value) return
  masterPending.value = true
  masterError.value = null
  masterPartial.value = null
  try {
    const res = await $fetch<{ successCount: number; failureCount: number; total: number }>(
      `/api/rooms/${props.room.id}/lights-state`,
      { method: 'POST', body: { on: nextOn } },
    )
    if (res.failureCount > 0) {
      masterPartial.value = { ok: res.successCount, failed: res.failureCount }
    }
    emit('master-toggled')
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    masterError.value = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed')
  } finally {
    masterPending.value = false
  }
}

watch(() => props.room.reference, (ref) => {
  if (!editing.value) {
    refTempEnabled.value = ref !== null && ref.refTemp !== null
    refHumEnabled.value  = ref !== null && ref.refHumidity !== null
    refTemp.value        = ref?.refTemp     ?? 21
    refHumidity.value    = ref?.refHumidity ?? 50
  }
})

watch(editing, (open) => {
  if (open) {
    refTempEnabled.value = props.room.reference !== null && props.room.reference.refTemp !== null
    refHumEnabled.value  = props.room.reference !== null && props.room.reference.refHumidity !== null
    refTemp.value        = props.room.reference?.refTemp     ?? 21
    refHumidity.value    = props.room.reference?.refHumidity ?? 50
    editName.value       = props.room.name
  }
})

function saveRef() {
  if (editName.value.trim() && editName.value.trim() !== props.room.name) {
    emit('rename-room', props.room.id, editName.value.trim())
  }
  emit('save-ref', props.room.id,
    refTempEnabled.value ? refTemp.value : null,
    refHumEnabled.value  ? refHumidity.value : null,
  )
  editing.value = false
}

function closeEditing() {
  if (editName.value.trim() && editName.value.trim() !== props.room.name) {
    emit('rename-room', props.room.id, editName.value.trim())
  }
  editing.value = false
}

function motionLabelFor(ts: number | null) {
  if (!ts) return null
  const diff = Math.round((Date.now() - ts) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  return `${Math.round(diff / 3600)}h ago`
}

function recentMotion(ts: number | null) {
  return ts ? Date.now() - ts < 5 * 60 * 1000 : false
}

const now = ref(Date.now())
onMounted(() => {
  const t = setInterval(() => { now.value = Date.now() }, 10_000)
  onUnmounted(() => clearInterval(t))
})
function isOffline(ms: number | null) {
  return !ms || now.value - ms > 30_000
}
</script>

<template>
  <div class="room-card" :class="{ editing }">
    <!-- Floating room actions on the top border -->
    <div class="card-actions">
      <button class="icon-btn" title="Add sensor" @click="emit('add-sensor', room.id)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
      <button class="icon-btn edit-btn" :class="{ active: editing }" title="Edit" @click="editing ? closeEditing() : (editing = true)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>
      </button>
      <button class="icon-btn delete-btn" title="Remove room" @click="confirmRoom = true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
        </svg>
      </button>
    </div>

    <!-- Header -->
    <div class="card-header">
      <input
        v-if="editing"
        v-model="editName"
        class="room-name-input"
        maxlength="60"
        @keydown.enter="closeEditing"
        @keydown.escape="editing = false"
      />
      <h2 v-else class="room-name">{{ room.name }}</h2>
      <MasterLightToggle
        v-if="room.lightMaster"
        class="room-master"
        :master="room.lightMaster"
        :pending="masterPending"
        :error="masterError"
        :partial="masterPartial"
        @toggle="toggleRoomMaster"
      />
    </div>

    <!-- Sectioned content -->
    <div v-if="hasAnyContent" class="room-sections">

      <!-- Ambient: temperature, humidity, motion -->
      <div v-if="hasAmbient" class="ambient-strip">
        <ClimateTile
          v-if="tempSensor"
          variant="temperature"
          :sensor="tempSensor"
          :reference="room.reference"
          :editing="editing"
          :is-offline="isOffline(tempSensor.lastRecordedAt)"
          @view-history="(s) => emit('view-history', s)"
          @edit-sensor="(id) => emit('edit-sensor', id)"
          @remove-sensor="(id) => emit('remove-sensor', id)"
        />
        <ClimateTile
          v-if="humSensor"
          variant="humidity"
          :sensor="humSensor"
          :reference="room.reference"
          :editing="editing"
          :is-offline="isOffline(humSensor.lastRecordedAt)"
          @view-history="(s) => emit('view-history', s)"
          @edit-sensor="(id) => emit('edit-sensor', id)"
          @remove-sensor="(id) => emit('remove-sensor', id)"
        />
        <MotionTile
          v-if="motionSensor"
          :sensor="motionSensor"
          :editing="editing"
          :is-offline="isOffline(motionSensor.lastRecordedAt)"
          :recent-motion="recentMotion(motionSensor.lastMotion)"
          :motion-label="motionLabelFor(motionSensor.lastMotion)"
          @view-history="(s) => emit('view-history', s)"
          @edit-sensor="(id) => emit('edit-sensor', id)"
          @remove-sensor="(id) => emit('remove-sensor', id)"
        />
      </div>

      <!-- Cameras -->
      <div v-if="hasCamera" class="camera-area">
        <CameraTile
          v-for="cam in cameras"
          :key="cam.id"
          :sensor="cam"
          :editing="editing"
          :recent-motion="recentMotion(cam.lastMotion)"
          @open-live="(id) => emit('open-live', id)"
          @edit-sensor="(id) => emit('edit-sensor', id)"
          @remove-sensor="(id) => emit('remove-sensor', id)"
        />
      </div>

      <!-- Lighting: groups, then individual lights -->
      <div v-if="hasLighting" class="lighting-area">
        <div v-if="lightGroups.length" class="light-groups">
          <LightGroupTile
            v-for="group in lightGroups"
            :key="`group-${group.id}`"
            :group="group"
            :members="group.memberSensorIds.map(id => lightsById.get(id)).filter((s): s is SensorView => !!s)"
            :editing="editing"
            @edit-group="(id) => emit('edit-group', id)"
            @ungroup="(id) => emit('ungroup', id)"
            @open-detail="(id) => detailGroupId = id"
          />
        </div>
        <div v-if="ungroupedLights.length" class="light-chips">
          <HueLightTile
            v-for="light in ungroupedLights"
            :key="light.id"
            :sensor="light"
            :editing="editing"
            @edit-sensor="(id) => emit('edit-sensor', id)"
            @remove-sensor="(id) => emit('remove-sensor', id)"
          />
        </div>
      </div>

    </div>

    <!-- Group affordance: show in edit mode when there are at least 2 lights -->
    <Transition name="slide">
      <div v-if="editing && lights.length >= 2" class="group-panel">
        <button class="btn-group" @click="emit('add-group', room.id)">
          <span class="plus">+</span> Group lights
        </button>
      </div>
    </Transition>

    <!-- Edit panel: per-sensor target toggles (only when climate sensors present) -->
    <Transition name="slide">
      <div v-if="editing && hasClimate" class="edit-panel">

        <div v-if="tempSensor" class="target-row">
          <div class="toggle-row">
            <span class="toggle-label">🌡️ Target temperature</span>
            <label class="toggle-switch">
              <input v-model="refTempEnabled" type="checkbox" />
              <span class="toggle-track"><span class="toggle-thumb" /></span>
            </label>
          </div>
          <Transition name="slide">
            <div v-if="refTempEnabled" class="slider-wrap">
              <div class="slider-labels">
                <span class="slider-value">{{ refTemp }}°C</span>
              </div>
              <input v-model.number="refTemp" type="range" min="10" max="30" step="0.5" class="slider" />
              <div class="slider-ticks"><span>10°</span><span>20°</span><span>30°</span></div>
            </div>
          </Transition>
        </div>

        <div v-if="humSensor" class="target-row">
          <div class="toggle-row">
            <span class="toggle-label">💧 Target humidity</span>
            <label class="toggle-switch">
              <input v-model="refHumEnabled" type="checkbox" />
              <span class="toggle-track"><span class="toggle-thumb" /></span>
            </label>
          </div>
          <Transition name="slide">
            <div v-if="refHumEnabled" class="slider-wrap">
              <div class="slider-labels">
                <span class="slider-value">{{ refHumidity }}%</span>
              </div>
              <input v-model.number="refHumidity" type="range" min="20" max="80" step="1" class="slider" />
              <div class="slider-ticks"><span>20%</span><span>50%</span><span>80%</span></div>
            </div>
          </Transition>
        </div>

        <div class="edit-actions">
          <button class="btn-save" @click="saveRef">Save</button>
        </div>
      </div>
    </Transition>
  </div>

  <ConfirmDialog
    v-if="confirmRoom"
    :message="`Delete room &quot;${room.name}&quot;? This will also remove all its sensors.`"
    @confirm="emit('remove-room', room.id); confirmRoom = false"
    @cancel="confirmRoom = false"
  />

  <LightGroupDetailModal
    v-if="detailGroup"
    :group="detailGroup"
    :members="detailGroupMembers"
    @close="detailGroupId = null"
  />
</template>

<style scoped>
.room-card {
  position: relative;
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 18px;
  padding: 30px 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  transition: border-color 0.2s;
  container-type: inline-size;
}

.room-card:hover,
.room-card.editing {
  border-color: #4a6fa5;
}

/* Header */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
}

.room-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #e2e8f0;
  letter-spacing: 0.01em;
}

.room-name-input {
  font-size: 1.1rem;
  font-weight: 600;
  color: #e2e8f0;
  letter-spacing: 0.01em;
  background: #151825;
  border: 1px solid #4a6fa5;
  border-radius: 6px;
  padding: 3px 10px;
  outline: none;
  flex: 1;
  min-width: 0;
}

.room-master {
  margin-left: auto;
}

/* Floating action cluster — segmented pill straddling the top-right card border */
.card-actions {
  position: absolute;
  top: -15px;
  right: 18px;
  display: inline-flex;
  z-index: 2;
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 9px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s, border-color 0.15s;
}

.room-card:hover .card-actions,
.room-card.editing .card-actions,
.room-card:has(.card-actions :focus-visible) .card-actions {
  opacity: 1;
  pointer-events: auto;
}

.icon-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.icon-btn + .icon-btn {
  border-left: 1px solid #2a2f45;
}

.icon-btn:hover    { color: #cbd5e1; background: #252a3d; }
.edit-btn.active   { color: #a0c4ff; background: #252a3d; }
.delete-btn:hover  { color: #f87171; background: #2a1f24; }

/* Sectioned content */
.room-sections {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* Subtle hairline between adjacent sections — keeps the card legible without loud headings */
.room-sections > * + * {
  padding-top: 18px;
  border-top: 1px solid #232839;
}

/* Ambient strip — temperature, humidity, motion side-by-side */
.ambient-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

/* Camera area — stacked, each tile full card width for prominence */
.camera-area {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

/* Lighting area — groups stacked above chips */
.lighting-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.light-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.light-chips {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 12px;
}

/* Edit panel */
.edit-panel {
  border-top: 1px solid #2a2f45;
  padding-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #94a3b8;
}

.slider-value { font-weight: 600; color: #a0c4ff; }

.slider {
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: #2a2f45;
  outline: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #4a6fa5;
  border: 2px solid #a0c4ff;
  cursor: pointer;
}

.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #4a6fa5;
  border: 2px solid #a0c4ff;
  cursor: pointer;
}

.slider-ticks {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  color: #334155;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toggle-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #94a3b8;
}

.toggle-switch {
  position: relative;
  cursor: pointer;
}

.toggle-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-track {
  display: block;
  width: 36px;
  height: 20px;
  background: #2a2f45;
  border-radius: 10px;
  transition: background 0.2s;
  position: relative;
}

.toggle-switch input:checked + .toggle-track {
  background: #4a6fa5;
}

.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  background: #64748b;
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}

.toggle-switch input:checked + .toggle-track .toggle-thumb {
  transform: translateX(16px);
  background: #a0c4ff;
}

.target-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slider-wrap {
  display: flex;
  flex-direction: column;
  gap: 7px;
  overflow: hidden;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-save {
  padding: 0 14px;
  min-width: 64px;
  height: 30px;
  line-height: 30px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  background: #4a6fa5;
  color: #fff;
  border: none;
}
.btn-save:hover { opacity: 0.85; }

.group-panel {
  border-top: 1px solid #2a2f45;
  padding-top: 14px;
  display: flex;
  justify-content: flex-start;
}
.btn-group {
  background: none;
  color: #94a3b8;
  border: 1px dashed #2a2f45;
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.btn-group:hover { color: #a0c4ff; border-color: #4a6fa5; }
.btn-group .plus { font-weight: 700; font-size: 0.95rem; line-height: 1; }

.slide-enter-active,
.slide-leave-active {
  transition: max-height 0.25s ease, opacity 0.2s ease;
  max-height: 500px;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
