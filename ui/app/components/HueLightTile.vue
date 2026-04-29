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

// Live brightness — throttle in-flight sends so the bulb tracks the slider during drag
// without flooding the Hue bridge. Trailing edge fires every 120ms with the latest value;
// `pending` is intentionally NOT toggled mid-drag so the slider stays interactive.
let briThrottleTimer: ReturnType<typeof setTimeout> | null = null
let lastSentBri = -1

async function sendBrightness(value: number) {
  if (!props.sensor.deviceId) return
  if (value === lastSentBri) return
  lastSentBri = value
  error.value = null
  try {
    const body: { brightness: number; on?: boolean } = { brightness: value }
    if (value > 0 && !localOn.value) { body.on = true; localOn.value = true }
    await $fetch(deviceUrl(), { method: 'POST', body })
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    error.value = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed')
  }
}

function onBrightnessInput() {
  dragging.value = true
  if (briThrottleTimer !== null) return
  briThrottleTimer = setTimeout(() => {
    briThrottleTimer = null
    sendBrightness(localBri.value)
  }, 120)
}

async function commitBrightness() {
  dragging.value = false
  if (briThrottleTimer) {
    clearTimeout(briThrottleTimer)
    briThrottleTimer = null
  }
  pending.value = true
  try {
    await sendBrightness(localBri.value)
  } finally {
    pending.value = false
  }
}

onUnmounted(() => {
  if (briThrottleTimer) clearTimeout(briThrottleTimer)
})

const reachable = computed(() => props.sensor.lightReachable !== false)
const hasBrightness = computed(() => props.sensor.capabilities?.brightness === true)
const displayName = computed(() => props.sensor.label?.trim() || props.sensor.hueName?.trim() || '')
</script>

<template>
  <div class="sensor-tile light-tile" :class="{ 'tile-offline': !reachable, 'is-on': localOn }">
    <button
      class="toggle-btn"
      :class="{ on: localOn }"
      :disabled="pending || !reachable"
      :title="localOn ? 'Turn off' : 'Turn on'"
      @click.stop="toggleOn"
    >
      <span class="bulb">💡</span>
    </button>

    <div class="chip-text">
      <span class="chip-name" :title="displayName || 'Light'">{{ displayName || 'Light' }}</span>
      <span class="chip-state" :class="{ off: !localOn }">{{ localOn ? 'On' : 'Off' }}</span>
    </div>

    <input
      v-if="hasBrightness"
      v-model.number="localBri"
      type="range" min="0" max="100" step="1"
      class="bri-slider"
      :disabled="!reachable"
      :title="`Brightness ${localBri}%`"
      @click.stop
      @mousedown="dragging = true"
      @touchstart="dragging = true"
      @input="onBrightnessInput"
      @change="commitBrightness"
    />

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
  border-radius: 12px;
  padding: 18px 14px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  position: relative;
  min-height: 144px;
  text-align: center;
}

.light-tile.is-on {
  background: linear-gradient(180deg, #1d2238 0%, #151825 100%);
}

.toggle-btn {
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid #2a2f45;
  background: #1a1d2c;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  line-height: 1;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.toggle-btn .bulb {
  filter: grayscale(0.6) brightness(0.7);
  transition: filter 0.15s;
}
.toggle-btn.on {
  background: #4a6fa5;
  border-color: #a0c4ff;
  box-shadow: 0 0 12px rgba(160, 196, 255, 0.35);
}
.toggle-btn.on .bulb { filter: none; }
.toggle-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.chip-text {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 2px;
  width: 100%;
  min-width: 0;
}

.chip-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  line-height: 1.2;
}

.chip-state {
  font-size: 0.6rem;
  color: #a0c4ff;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}
.chip-state.off { color: #475569; }

.bri-slider {
  width: 100%;
  -webkit-appearance: none;
  height: 3px;
  border-radius: 2px;
  background: #2a2f45;
  outline: none;
  cursor: pointer;
  margin-top: 2px;
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
  cursor: pointer;
  border: 0;
}

.tile-offline-badge {
  font-size: 0.55rem;
  font-weight: 700;
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
  border-radius: 4px;
  padding: 0 4px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.error-badge {
  position: absolute; top: 4px; left: 4px;
  background: #ef4444; color: #fff;
  width: 14px; height: 14px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.65rem; font-weight: 700;
}

.sensor-tile.tile-offline {
  background: rgba(248, 113, 113, 0.06);
  outline: 1px solid rgba(248, 113, 113, 0.3);
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
