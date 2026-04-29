<script setup lang="ts">
import type { RoomReference, SensorView } from '../../shared/types'

const props = defineProps<{
  sensor: SensorView
  reference: RoomReference | null
  variant: 'temperature' | 'humidity'
  editing: boolean
  isOffline: boolean
}>()

const emit = defineEmits<{
  (e: 'view-history', sensor: SensorView): void
  (e: 'edit-sensor', sensorId: number): void
  (e: 'remove-sensor', sensorId: number): void
}>()

const confirmRemove = ref(false)

const isTemp = computed(() => props.variant === 'temperature')
const icon = computed(() => isTemp.value ? '🌡️' : '💧')
const label = computed(() => isTemp.value ? 'Temperature' : 'Humidity')
const unit = computed(() => isTemp.value ? '°C' : '%')
const refValue = computed(() => isTemp.value
  ? props.reference?.refTemp ?? null
  : props.reference?.refHumidity ?? null)
const refUnit = computed(() => isTemp.value ? '°' : '%')

const formattedValue = computed(() => {
  if (props.sensor.latestValue === null) return '—'
  return `${props.sensor.latestValue}${unit.value}`
})

const deviation = computed(() => {
  const actual = props.sensor.latestValue
  const ref = refValue.value
  if (actual === null || ref === null) return null
  const diff = actual - ref
  return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}${refUnit.value}`
})

const deviationDirection = computed(() => {
  if (!deviation.value) return null
  return parseFloat(deviation.value) > 0 ? 'over' : 'under'
})
</script>

<template>
  <div
    class="sensor-tile climate-tile sensor-clickable"
    :class="{ 'tile-offline': isOffline }"
    @click="emit('view-history', sensor)"
  >
    <span class="tile-icon">{{ icon }}</span>
    <span class="tile-value" :class="{ offline: isOffline }">{{ formattedValue }}</span>
    <span class="tile-label">{{ label }}</span>
    <span v-if="sensor.label" class="tile-custom-label">{{ sensor.label }}</span>
    <span v-if="refValue !== null" class="tile-ref">
      target {{ refValue }}{{ refUnit }}
      <span v-if="deviation" class="dev" :class="deviationDirection">{{ deviation }}</span>
    </span>

    <div v-if="isTemp" class="relay-indicators">
      <span class="relay-indicator" :class="{ active: sensor.heaterActive }" title="Heater">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M3 6 Q6 3 9 6 Q12 9 15 6 Q18 3 21 6"/>
          <path d="M3 12 Q6 9 9 12 Q12 15 15 12 Q18 9 21 12"/>
          <path d="M3 18 Q6 15 9 18 Q12 21 15 18 Q18 15 21 18"/>
        </svg>
      </span>
      <span class="relay-indicator fan" :class="{ active: sensor.fanActive }" title="Fan">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6.93-1A7 7 0 0 0 13 4.07V2h-2v2.07A7 7 0 0 0 5.07 10H3v2h2.07A7 7 0 0 0 11 19.93V22h2v-2.07A7 7 0 0 0 18.93 13H21v-2h-2.07zM12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/></svg>
      </span>
    </div>

    <span v-if="isOffline" class="tile-offline-badge">Offline</span>

    <div v-if="editing" class="tile-actions">
      <button class="tile-action-btn" title="Edit sensor" @click.stop="emit('edit-sensor', sensor.id)">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>
      </button>
      <button class="tile-action-btn remove" title="Remove sensor" @click.stop="confirmRemove = true">×</button>
    </div>

    <ConfirmDialog
      v-if="confirmRemove"
      message="Remove this sensor from the room?"
      confirm-label="Remove"
      @confirm="emit('remove-sensor', sensor.id); confirmRemove = false"
      @cancel="confirmRemove = false"
    />
  </div>
</template>

<style scoped>
.sensor-tile {
  background: #151825;
  border-radius: 12px;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  position: relative;
  min-height: 110px;
  text-align: center;
}

.sensor-clickable {
  cursor: pointer;
  transition: background 0.15s;
}

.sensor-tile.sensor-clickable:hover { background: #1a2035; }

.tile-icon { font-size: 1.35rem; line-height: 1; }

.tile-value {
  font-size: 1.3rem;
  font-weight: 700;
  color: #a0c4ff;
  line-height: 1.1;
}

.tile-value.offline { color: #475569; }

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
  margin-top: 4px;
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
}

.dev { font-weight: 600; }
.dev.over  { color: #f87171; }
.dev.under { color: #34d399; }

.relay-indicators {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.relay-indicator {
  color: #2a2f45;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}

.relay-indicator.active     { color: #f97316; }
.relay-indicator.fan.active { color: #38bdf8; }

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
</style>
