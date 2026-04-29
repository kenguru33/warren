<script setup lang="ts">
import type { SensorView } from '../../shared/types'

defineProps<{
  sensor: SensorView
  editing: boolean
  recentMotion: boolean
}>()

const emit = defineEmits<{
  (e: 'open-live', sensorId: number): void
  (e: 'edit-sensor', sensorId: number): void
  (e: 'remove-sensor', sensorId: number): void
}>()

const confirmRemove = ref(false)
</script>

<template>
  <div class="sensor-tile camera-tile sensor-clickable" @click="emit('open-live', sensor.id)">
    <img v-if="sensor.snapshotUrl" :src="sensor.snapshotUrl" :alt="sensor.label ?? 'Camera'" class="cam-img" />
    <div v-else class="cam-placeholder">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
        <circle cx="12" cy="13" r="3"/>
      </svg>
    </div>
    <div class="cam-overlay">▶ Live</div>
    <div v-if="recentMotion" class="motion-badge">Motion</div>
    <span class="cam-floor-label">{{ sensor.label ?? 'Camera' }}</span>

    <div v-if="editing" class="tile-actions cam-actions">
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
  position: relative;
  text-align: center;
  overflow: hidden;
  padding: 0;
  aspect-ratio: 16 / 9;
  min-height: 0;
}

.sensor-clickable {
  cursor: pointer;
  transition: background 0.15s;
}

.sensor-tile.sensor-clickable:hover { background: #1a2035; }

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
  background: rgba(0, 0, 0, 0.5);
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
  padding: 8px 10px 6px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  font-size: 0.72rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
  letter-spacing: 0.02em;
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
  /* Light tone since the snapshot behind is usually dark; falls back to the sensor-tile
     hover color if the snapshot happens to be bright. */
  color: #cbd5e1;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
}

.tile-action-btn:hover { color: #fff; }
.tile-action-btn.remove:hover { color: #f87171; }
</style>
