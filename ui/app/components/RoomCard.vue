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
}>()

const tempSensor    = computed(() => props.room.sensors.find(s => s.type === 'temperature') ?? null)
const humSensor     = computed(() => props.room.sensors.find(s => s.type === 'humidity')    ?? null)
const motionSensor  = computed(() => props.room.sensors.find(s => s.type === 'motion')      ?? null)
const cameras       = computed(() => props.room.sensors.filter(s => s.type === 'camera'))
const lights        = computed(() => props.room.sensors.filter(s => s.type === 'light'))
const hasClimate    = computed(() => tempSensor.value || humSensor.value)

const editing        = ref(false)
const refTempEnabled = ref(props.room.reference !== null && props.room.reference.refTemp !== null)
const refHumEnabled  = ref(props.room.reference !== null && props.room.reference.refHumidity !== null)
const refTemp        = ref(props.room.reference?.refTemp     ?? 21)
const refHumidity    = ref(props.room.reference?.refHumidity ?? 50)
const editName       = ref(props.room.name)

const confirmRoom   = ref(false)
const confirmSensor = ref<number | null>(null)

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

function deviation(actual: number | null, ref: number, unit: string) {
  if (actual === null || !props.room.reference) return null
  const diff = actual - ref
  return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}${unit}`
}

const tempDev = computed(() => deviation(tempSensor.value?.latestValue ?? null, refTemp.value, '°'))
const humDev  = computed(() => deviation(humSensor.value?.latestValue  ?? null, refHumidity.value, '%'))

function motionLabel(ts: number | null) {
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
      <div class="header-actions">
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
    </div>

    <!-- Sensor grid: all types as equal-sized tiles -->
    <div v-if="room.sensors.length" class="sensor-grid">

      <!-- Temperature -->
      <div v-if="tempSensor" class="sensor-tile sensor-clickable" :class="{ 'tile-offline': isOffline(tempSensor.lastRecordedAt) }" @click="emit('view-history', tempSensor)">
        <span class="tile-icon">🌡️</span>
        <span class="tile-value" :class="{ offline: isOffline(tempSensor.lastRecordedAt) }">{{ tempSensor.latestValue !== null ? `${tempSensor.latestValue}°C` : '—' }}</span>
        <span class="tile-label">Temperature</span>
        <span v-if="tempSensor.label" class="tile-custom-label">{{ tempSensor.label }}</span>
        <span v-if="room.reference?.refTemp !== null && room.reference !== null" class="tile-ref">
          target {{ room.reference.refTemp }}°
          <span v-if="tempDev" class="dev" :class="parseFloat(tempDev) > 0 ? 'over' : 'under'">{{ tempDev }}</span>
        </span>
        <div class="relay-indicators">
          <span class="relay-indicator" :class="{ active: tempSensor.heaterActive }" title="Heater">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M3 6 Q6 3 9 6 Q12 9 15 6 Q18 3 21 6"/>
              <path d="M3 12 Q6 9 9 12 Q12 15 15 12 Q18 9 21 12"/>
              <path d="M3 18 Q6 15 9 18 Q12 21 15 18 Q18 15 21 18"/>
            </svg>
          </span>
          <span class="relay-indicator fan" :class="{ active: tempSensor.fanActive }" title="Fan">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6.93-1A7 7 0 0 0 13 4.07V2h-2v2.07A7 7 0 0 0 5.07 10H3v2h2.07A7 7 0 0 0 11 19.93V22h2v-2.07A7 7 0 0 0 18.93 13H21v-2h-2.07zM12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/></svg>
          </span>
        </div>
        <span v-if="isOffline(tempSensor.lastRecordedAt)" class="tile-offline-badge">Offline</span>
        <div v-if="editing" class="tile-actions">
          <button class="tile-action-btn" title="Edit sensor" @click.stop="emit('edit-sensor', tempSensor.id)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
          </button>
          <button class="tile-action-btn remove" title="Remove sensor" @click.stop="confirmSensor = tempSensor.id">×</button>
        </div>
      </div>

      <!-- Humidity -->
      <div v-if="humSensor" class="sensor-tile sensor-clickable" :class="{ 'tile-offline': isOffline(humSensor.lastRecordedAt) }" @click="emit('view-history', humSensor)">
        <span class="tile-icon">💧</span>
        <span class="tile-value" :class="{ offline: isOffline(humSensor.lastRecordedAt) }">{{ humSensor.latestValue !== null ? `${humSensor.latestValue}%` : '—' }}</span>
        <span class="tile-label">Humidity</span>
        <span v-if="humSensor.label" class="tile-custom-label">{{ humSensor.label }}</span>
        <span v-if="room.reference !== null && room.reference?.refHumidity !== null" class="tile-ref">
          target {{ room.reference.refHumidity }}%
          <span v-if="humDev" class="dev" :class="parseFloat(humDev) > 0 ? 'over' : 'under'">{{ humDev }}</span>
        </span>
        <span v-if="isOffline(humSensor.lastRecordedAt)" class="tile-offline-badge">Offline</span>
        <div v-if="editing" class="tile-actions">
          <button class="tile-action-btn" title="Edit sensor" @click.stop="emit('edit-sensor', humSensor.id)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
          </button>
          <button class="tile-action-btn remove" title="Remove sensor" @click.stop="confirmSensor = humSensor.id">×</button>
        </div>
      </div>

      <!-- Cameras -->
      <div
        v-for="cam in cameras"
        :key="cam.id"
        class="sensor-tile camera-tile sensor-clickable"
        @click="emit('open-live', cam.id)"
      >
        <img v-if="cam.snapshotUrl" :src="cam.snapshotUrl" :alt="cam.label ?? 'Camera'" class="cam-img" />
        <div v-else class="cam-placeholder">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
        </div>
        <div class="cam-overlay">▶ Live</div>
        <div v-if="recentMotion(cam.lastMotion)" class="motion-badge">Motion</div>
        <span class="cam-floor-label">{{ cam.label ?? 'Camera' }}</span>
        <div v-if="editing" class="tile-actions cam-actions">
          <button class="tile-action-btn" title="Edit sensor" @click.stop="emit('edit-sensor', cam.id)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
          </button>
          <button class="tile-action-btn remove" title="Remove sensor" @click.stop="confirmSensor = cam.id">×</button>
        </div>
      </div>

      <!-- Hue Lights -->
      <HueLightTile
        v-for="light in lights"
        :key="light.id"
        :sensor="light"
        :editing="editing"
        @edit-sensor="(id) => emit('edit-sensor', id)"
        @remove-sensor="(id) => emit('remove-sensor', id)"
      />

      <!-- Motion -->
      <div
        v-if="motionSensor"
        class="sensor-tile sensor-clickable"
        :class="{ 'motion-active': recentMotion(motionSensor.lastMotion), 'tile-offline': isOffline(motionSensor.lastRecordedAt) }"
        @click="emit('view-history', motionSensor)"
      >
        <span class="tile-icon">🏃</span>
        <span class="tile-value" :class="{ 'motion-recent': recentMotion(motionSensor.lastMotion), offline: isOffline(motionSensor.lastRecordedAt) }">
          {{ motionSensor.lastMotion ? (recentMotion(motionSensor.lastMotion) ? 'Detected' : 'Clear') : '—' }}
        </span>
        <span class="tile-label">Motion</span>
        <span v-if="motionSensor.label" class="tile-custom-label">{{ motionSensor.label }}</span>
        <span v-if="motionSensor.lastMotion" class="tile-ref">{{ motionLabel(motionSensor.lastMotion) }}</span>
        <span v-if="isOffline(motionSensor.lastRecordedAt)" class="tile-offline-badge">Offline</span>
        <div v-if="editing" class="tile-actions">
          <button class="tile-action-btn" title="Edit sensor" @click.stop="emit('edit-sensor', motionSensor.id)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
          </button>
          <button class="tile-action-btn remove" title="Remove sensor" @click.stop="confirmSensor = motionSensor.id">×</button>
        </div>
      </div>

    </div>

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

  <ConfirmDialog
    v-if="confirmSensor !== null"
    message="Remove this sensor from the room?"
    confirm-label="Remove"
    @confirm="emit('remove-sensor', confirmSensor!); confirmSensor = null"
    @cancel="confirmSensor = null"
  />
</template>

<style scoped>
.room-card {
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: border-color 0.2s;
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
  gap: 8px;
}

.room-name {
  font-size: 1.05rem;
  font-weight: 600;
  color: #e2e8f0;
  letter-spacing: 0.02em;
}

.room-name-input {
  font-size: 1.05rem;
  font-weight: 600;
  color: #e2e8f0;
  letter-spacing: 0.02em;
  background: #151825;
  border: 1px solid #4a6fa5;
  border-radius: 6px;
  padding: 2px 8px;
  outline: none;
  flex: 1;
  min-width: 0;
}

.header-actions {
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s;
}

.room-card:hover .header-actions,
.room-card.editing .header-actions {
  opacity: 1;
}

.icon-btn {
  background: none;
  border: 1px solid #2a2f45;
  color: #475569;
  border-radius: 7px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.icon-btn:hover    { color: #94a3b8; border-color: #4a6fa5; }
.edit-btn.active   { color: #a0c4ff; border-color: #4a6fa5; background: #151825; }
.delete-btn:hover  { color: #f87171; border-color: #ef4444; }

/* Sensor grid — max 2 columns */
.sensor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.sensor-tile {
  background: #151825;
  border-radius: 10px;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  position: relative;
  min-height: 96px;
  text-align: center;
}

.sensor-clickable {
  cursor: pointer;
  transition: background 0.15s;
}

.sensor-tile.sensor-clickable:hover { background: #1a2035; }

.tile-icon { font-size: 1.3rem; }

.tile-value {
  font-size: 1.2rem;
  font-weight: 700;
  color: #a0c4ff;
}

.tile-label {
  font-size: 0.68rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.tile-custom-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.tile-ref {
  font-size: 0.68rem;
  color: #475569;
  margin-top: 2px;
  display: flex;
  gap: 3px;
  align-items: center;
  justify-content: center;
}

.dev { font-weight: 600; }
.dev.over  { color: #f87171; }
.dev.under { color: #34d399; }

.relay-indicators {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}

.relay-indicator {
  color: #2a2f45;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}

.relay-indicator.active     { color: #f97316; }
.relay-indicator.fan.active { color: #38bdf8; }

.tile-actions {
  position: absolute;
  top: 5px;
  right: 5px;
  display: flex;
  gap: 2px;
}

.tile-action-btn {
  background: none;
  border: none;
  color: #334155;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tile-action-btn:hover { color: #94a3b8; }
.tile-action-btn.remove:hover { color: #f87171; }

.cam-actions .tile-action-btn {
  background: rgba(0,0,0,0.55);
  color: #cbd5e1;
}

/* Camera tile */
.camera-tile {
  padding: 0;
  overflow: hidden;
}

.cam-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cam-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2a2f45;
}

.cam-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 600;
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s;
  letter-spacing: 0.04em;
}

.camera-tile:hover .cam-overlay { opacity: 1; }

.cam-floor-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 6px;
  background: linear-gradient(transparent, rgba(0,0,0,0.65));
  font-size: 0.68rem;
  color: rgba(255,255,255,0.8);
  text-align: center;
}


.motion-badge {
  position: absolute;
  top: 5px;
  left: 5px;
  background: #ef4444;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Motion tile */
.motion-recent { color: #f87171; }

.tile-value.offline { color: #475569; }

.sensor-tile.tile-offline {
  background: rgba(248, 113, 113, 0.06);
  outline: 1px solid rgba(248, 113, 113, 0.3);
}

.tile-offline-badge {
  font-size: 0.58rem;
  font-weight: 700;
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
  border-radius: 4px;
  padding: 1px 4px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-top: 2px;
}


/* Edit panel */
.edit-panel {
  border-top: 1px solid #2a2f45;
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.slider-row {
  display: flex;
  flex-direction: column;
  gap: 7px;
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
