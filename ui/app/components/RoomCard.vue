<script setup lang="ts">
import type { RoomWithSensors, SensorView } from '../../shared/types'

const props = defineProps<{ room: RoomWithSensors }>()

const emit = defineEmits<{
  (e: 'save-ref', roomId: number, refTemp: number, refHumidity: number): void
  (e: 'clear-ref', roomId: number): void
  (e: 'remove-room', roomId: number): void
  (e: 'remove-sensor', sensorId: number): void
  (e: 'add-sensor', roomId: number): void
  (e: 'open-live', sensorId: number): void
}>()

const tempSensor    = computed(() => props.room.sensors.find(s => s.type === 'temperature') ?? null)
const humSensor     = computed(() => props.room.sensors.find(s => s.type === 'humidity')    ?? null)
const motionSensor  = computed(() => props.room.sensors.find(s => s.type === 'motion')      ?? null)
const cameras       = computed(() => props.room.sensors.filter(s => s.type === 'camera'))
const hasClimate    = computed(() => tempSensor.value || humSensor.value)

const editing   = ref(false)
const refTemp     = ref(props.room.reference?.refTemp     ?? 21)
const refHumidity = ref(props.room.reference?.refHumidity ?? 50)

watch(() => props.room.reference, (ref) => {
  if (!editing.value) {
    refTemp.value     = ref?.refTemp     ?? 21
    refHumidity.value = ref?.refHumidity ?? 50
  }
})

watch(editing, (open) => {
  if (open) {
    refTemp.value     = props.room.reference?.refTemp     ?? 21
    refHumidity.value = props.room.reference?.refHumidity ?? 50
  }
})

function saveRef() {
  emit('save-ref', props.room.id, refTemp.value, refHumidity.value)
  editing.value = false
}

function clearRef() {
  emit('clear-ref', props.room.id)
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

function sensorIcon(s: SensorView) {
  return { temperature: '🌡️', humidity: '💧', camera: '📷', motion: '🏃' }[s.type]
}

function sensorDisplayLabel(s: SensorView) {
  return s.label || { temperature: 'Temperature', humidity: 'Humidity', camera: 'Camera', motion: 'Motion' }[s.type]
}
</script>

<template>
  <div class="room-card" :class="{ editing }">
    <!-- Header -->
    <div class="card-header">
      <h2 class="room-name">{{ room.name }}</h2>
      <div class="header-actions">
        <button class="icon-btn" title="Add sensor" @click="emit('add-sensor', room.id)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
        <button class="icon-btn edit-btn" :class="{ active: editing }" title="Set reference" @click="editing = !editing">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
        </button>
        <button class="icon-btn delete-btn" title="Remove room" @click="emit('remove-room', room.id)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Climate sensors -->
    <div v-if="hasClimate" class="sensors">
      <div v-if="tempSensor" class="sensor">
        <span class="sensor-icon">🌡️</span>
        <div class="sensor-data">
          <span class="sensor-value">
            {{ tempSensor.latestValue !== null ? `${tempSensor.latestValue}°C` : '—' }}
          </span>
          <span class="sensor-label">{{ tempSensor.label ?? 'Temperature' }}</span>
          <span v-if="room.reference" class="ref-line">
            ref {{ room.reference.refTemp }}°
            <span v-if="tempDev" class="dev" :class="parseFloat(tempDev) > 0 ? 'over' : 'under'">{{ tempDev }}</span>
          </span>
        </div>
      </div>
      <div v-if="humSensor" class="sensor">
        <span class="sensor-icon">💧</span>
        <div class="sensor-data">
          <span class="sensor-value">
            {{ humSensor.latestValue !== null ? `${humSensor.latestValue}%` : '—' }}
          </span>
          <span class="sensor-label">{{ humSensor.label ?? 'Humidity' }}</span>
          <span v-if="room.reference" class="ref-line">
            ref {{ room.reference.refHumidity }}%
            <span v-if="humDev" class="dev" :class="parseFloat(humDev) > 0 ? 'over' : 'under'">{{ humDev }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Cameras -->
    <div v-if="cameras.length" class="cameras">
      <div
        v-for="cam in cameras"
        :key="cam.id"
        class="camera-thumb"
        @click="emit('open-live', cam.id)"
      >
        <div class="thumb-area">
          <img v-if="cam.snapshotUrl" :src="cam.snapshotUrl" :alt="cam.label ?? 'Camera'" class="thumb-img" />
          <div v-else class="thumb-placeholder">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
          </div>
          <div class="thumb-overlay">▶ Live</div>
          <div v-if="recentMotion(cam.lastMotion)" class="motion-badge">Motion</div>
        </div>
        <span class="cam-label">{{ cam.label ?? 'Camera' }}</span>
      </div>
    </div>

    <!-- Motion status -->
    <div v-if="motionSensor" class="motion-row" :class="{ recent: recentMotion(motionSensor.lastMotion) }">
      <span>🏃</span>
      <span v-if="motionSensor.lastMotion">
        {{ recentMotion(motionSensor.lastMotion) ? 'Motion detected' : 'Last motion' }}
        — {{ motionLabel(motionSensor.lastMotion) }}
      </span>
      <span v-else class="no-motion">No motion recorded</span>
    </div>

    <!-- Edit panel -->
    <Transition name="slide">
      <div v-if="editing" class="edit-panel">
        <!-- Sensor list -->
        <div v-if="room.sensors.length" class="sensor-chips">
          <span
            v-for="s in room.sensors"
            :key="s.id"
            class="chip"
          >
            {{ sensorIcon(s) }} {{ sensorDisplayLabel(s) }}
            <button class="chip-remove" @click="emit('remove-sensor', s.id)">×</button>
          </span>
        </div>

        <!-- Ref sliders (only shown if climate sensors present) -->
        <template v-if="hasClimate">
          <div class="divider" />

          <div class="slider-row">
            <div class="slider-labels">
              <span>🌡️ Reference temp</span>
              <span class="slider-value">{{ refTemp }}°C</span>
            </div>
            <input v-model.number="refTemp" type="range" min="10" max="30" step="0.5" class="slider" />
            <div class="slider-ticks"><span>10°</span><span>20°</span><span>30°</span></div>
          </div>

          <div class="slider-row">
            <div class="slider-labels">
              <span>💧 Reference humidity</span>
              <span class="slider-value">{{ refHumidity }}%</span>
            </div>
            <input v-model.number="refHumidity" type="range" min="20" max="80" step="1" class="slider" />
            <div class="slider-ticks"><span>20%</span><span>50%</span><span>80%</span></div>
          </div>

          <div class="edit-actions">
            <button class="btn-clear" @click="clearRef">Clear ref</button>
            <button class="btn-save" @click="saveRef">Save reference</button>
          </div>
        </template>
      </div>
    </Transition>
  </div>
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
}

.room-name {
  font-size: 1.05rem;
  font-weight: 600;
  color: #e2e8f0;
  letter-spacing: 0.02em;
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

/* Climate sensors */
.sensors {
  display: flex;
  gap: 12px;
}

.sensor {
  flex: 1;
  background: #151825;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.sensor-icon { font-size: 1.3rem; }

.sensor-data {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sensor-value {
  font-size: 1.2rem;
  font-weight: 700;
  color: #a0c4ff;
}

.sensor-label {
  font-size: 0.7rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ref-line {
  font-size: 0.7rem;
  color: #475569;
  margin-top: 3px;
  display: flex;
  gap: 4px;
}

.dev { font-weight: 600; }
.dev.over  { color: #f87171; }
.dev.under { color: #34d399; }

/* Cameras */
.cameras {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.camera-thumb {
  display: flex;
  flex-direction: column;
  gap: 5px;
  cursor: pointer;
}

.thumb-area {
  position: relative;
  width: 120px;
  aspect-ratio: 16/9;
  border-radius: 8px;
  overflow: hidden;
  background: #151825;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2a2f45;
}

.thumb-overlay {
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

.camera-thumb:hover .thumb-overlay { opacity: 1; }

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

.cam-label {
  font-size: 0.72rem;
  color: #64748b;
  text-align: center;
}

/* Motion row */
.motion-row {
  font-size: 0.8rem;
  color: #475569;
  display: flex;
  gap: 6px;
  align-items: center;
}

.motion-row.recent { color: #f87171; }
.no-motion { color: #334155; }

/* Edit panel */
.edit-panel {
  border-top: 1px solid #2a2f45;
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sensor-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 20px;
  padding: 4px 10px;
  font-size: 0.78rem;
  color: #94a3b8;
}

.chip-remove {
  background: none;
  border: none;
  color: #475569;
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
  padding: 0;
  transition: color 0.15s;
}

.chip-remove:hover { color: #f87171; }

.divider { border: none; border-top: 1px solid #2a2f45; }

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

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-clear,
.btn-save {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.btn-clear { background: #151825; color: #64748b; }
.btn-clear:hover { color: #94a3b8; }
.btn-save  { background: #4a6fa5; color: #fff; }
.btn-save:hover { background: #6b93c7; }

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
