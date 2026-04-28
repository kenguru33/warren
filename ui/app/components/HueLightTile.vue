<script setup lang="ts">
import type { SensorView } from '../../shared/types'

const props = defineProps<{ sensor: SensorView; editing: boolean }>()

const emit = defineEmits<{
  (e: 'edit-sensor', sensorId: number): void
  (e: 'remove-sensor', sensorId: number): void
}>()

// Optimistic local state — reflects pending toggle/slider before the server confirms.
const localOn = ref<boolean | null>(props.sensor.lightOn ?? false)
const localBri = ref<number>(briFromHue(props.sensor.lightBrightness ?? 0))
const dragging = ref(false)
const error = ref<string | null>(null)
const pending = ref(false)
const confirmRemove = ref(false)

watch(() => props.sensor.lightOn, v => {
  if (!pending.value) localOn.value = v ?? false
})
watch(() => props.sensor.lightBrightness, v => {
  if (!dragging.value && !pending.value) localBri.value = briFromHue(v ?? 0)
})

function briFromHue(b: number): number {
  return Math.round((b / 254) * 100)
}

function deviceUrl() {
  return `/api/integrations/hue/lights/${encodeURIComponent(props.sensor.deviceId ?? '')}/state`
}

async function toggleOn() {
  if (!props.sensor.deviceId) return
  const next = !localOn.value
  const prev = localOn.value
  localOn.value = next
  pending.value = true
  error.value = null
  try {
    await $fetch(deviceUrl(), { method: 'POST', body: { on: next } })
  } catch (err: unknown) {
    localOn.value = prev
    const e = err as { data?: { error?: string }; message?: string }
    error.value = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed')
  } finally {
    pending.value = false
  }
}

async function commitBrightness() {
  if (!props.sensor.deviceId) return
  dragging.value = false
  pending.value = true
  error.value = null
  try {
    const body: { brightness: number; on?: boolean } = { brightness: localBri.value }
    if (localBri.value > 0 && !localOn.value) { body.on = true; localOn.value = true }
    await $fetch(deviceUrl(), { method: 'POST', body })
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    error.value = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed')
  } finally {
    pending.value = false
  }
}

const reachable = computed(() => props.sensor.lightReachable !== false)
const hasBrightness = computed(() => props.sensor.capabilities?.brightness === true)
const displayName = computed(() => props.sensor.label?.trim() || props.sensor.hueName?.trim() || '')
</script>

<template>
  <div class="sensor-tile light-tile" :class="{ 'tile-offline': !reachable, 'is-on': localOn }">
    <span class="tile-icon">💡</span>
    <span class="tile-value" :class="{ off: !localOn }">{{ localOn ? 'On' : 'Off' }}</span>
    <span class="tile-label">Light</span>
    <span v-if="displayName" class="tile-custom-label">{{ displayName }}</span>
    <span v-if="sensor.groupName" class="tile-group" :title="`In group: ${sensor.groupName}`">
      in group: {{ sensor.groupName }}
    </span>

    <button
      class="toggle-btn"
      :class="{ on: localOn }"
      :disabled="pending || !reachable"
      :title="localOn ? 'Turn off' : 'Turn on'"
      @click.stop="toggleOn"
    >
      <span class="dot" />
    </button>

    <div v-if="hasBrightness" class="brightness-row" @click.stop>
      <input
        v-model.number="localBri"
        type="range" min="0" max="100" step="1"
        class="bri-slider"
        :disabled="pending || !reachable"
        @mousedown="dragging = true"
        @touchstart="dragging = true"
        @change="commitBrightness"
      />
      <span class="bri-value">{{ localBri }}%</span>
    </div>

    <span v-if="!reachable" class="tile-offline-badge">Unreachable</span>
    <span v-if="error" class="error-badge" :title="error">!</span>

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
      message="Remove this light from the room? It will return to discovered devices."
      confirm-label="Remove"
      @confirm="emit('remove-sensor', sensor.id); confirmRemove = false"
      @cancel="confirmRemove = false"
    />
  </div>
</template>

<style scoped>
.sensor-tile {
  background: #151825;
  border-radius: 10px;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 5px;
  position: relative;
  min-height: 160px;
  text-align: center;
}

.light-tile.is-on {
  background: linear-gradient(180deg, #1d2238 0%, #151825 100%);
}

.tile-icon { font-size: 1.3rem; }
.tile-value {
  font-size: 1rem;
  font-weight: 700;
  color: #a0c4ff;
}
.tile-value.off { color: #475569; }

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

.tile-group {
  font-size: 0.6rem;
  color: #a0c4ff;
  background: rgba(74, 111, 165, 0.12);
  border-radius: 4px;
  padding: 1px 5px;
  letter-spacing: 0.04em;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toggle-btn {
  margin-top: 4px;
  width: 38px; height: 22px; padding: 0;
  border-radius: 11px;
  border: 1px solid #2a2f45;
  background: #2a2f45;
  cursor: pointer; position: relative;
  transition: background 0.15s, border-color 0.15s;
}
.toggle-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.toggle-btn .dot {
  position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #64748b;
  transition: transform 0.18s, background 0.15s;
}
.toggle-btn.on { background: #4a6fa5; border-color: #4a6fa5; }
.toggle-btn.on .dot { transform: translateX(16px); background: #f1f5f9; }

.brightness-row {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 0 4px; margin-top: 4px;
}
.bri-slider {
  flex: 1;
  -webkit-appearance: none;
  height: 3px;
  border-radius: 2px;
  background: #2a2f45;
  outline: none;
  cursor: pointer;
}
.bri-slider:disabled { opacity: 0.5; cursor: not-allowed; }
.bri-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #a0c4ff;
  cursor: pointer;
}
.bri-slider::-moz-range-thumb {
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #a0c4ff;
  cursor: pointer; border: 0;
}
.bri-value {
  font-size: 0.64rem; color: #64748b; font-variant-numeric: tabular-nums;
  min-width: 28px;
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

.error-badge {
  position: absolute; top: 5px; left: 5px;
  background: #ef4444; color: #fff;
  width: 16px; height: 16px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: 700;
}

.sensor-tile.tile-offline {
  background: rgba(248, 113, 113, 0.06);
  outline: 1px solid rgba(248, 113, 113, 0.3);
}

.tile-actions {
  position: absolute; top: 5px; right: 5px;
  display: flex; gap: 2px;
}
.tile-action-btn {
  background: none; border: none; color: #334155;
  cursor: pointer; font-size: 1rem; line-height: 1;
  padding: 2px 4px; border-radius: 4px;
  transition: color 0.15s;
  display: flex; align-items: center; justify-content: center;
}
.tile-action-btn:hover { color: #94a3b8; }
.tile-action-btn.remove:hover { color: #f87171; }
</style>
