<script setup lang="ts">
import type { SensorView } from '../../shared/types'

const props = defineProps<{
  sensor: SensorView
  editing: boolean
  isOffline: boolean
  recentMotion: boolean
  motionLabel: string | null
}>()

const emit = defineEmits<{
  (e: 'view-history', sensor: SensorView): void
  (e: 'edit-sensor', sensorId: number): void
  (e: 'remove-sensor', sensorId: number): void
}>()

const confirmRemove = ref(false)

const valueText = computed(() => {
  if (!props.sensor.lastMotion) return '—'
  return props.recentMotion ? 'Detected' : 'Clear'
})
</script>

<template>
  <div
    class="sensor-tile motion-tile sensor-clickable"
    :class="{ 'motion-active': recentMotion, 'tile-offline': isOffline }"
    @click="emit('view-history', sensor)"
  >
    <span class="tile-icon">🏃</span>
    <span class="tile-value" :class="{ 'motion-recent': recentMotion, offline: isOffline }">
      {{ valueText }}
    </span>
    <span class="tile-label">Motion</span>
    <span v-if="sensor.label" class="tile-custom-label">{{ sensor.label }}</span>
    <span v-if="sensor.lastMotion && motionLabel" class="tile-ref">{{ motionLabel }}</span>
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
.motion-recent { color: #f87171; }

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
