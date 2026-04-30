<script setup lang="ts">
import type { SensorView } from '../../shared/types'

const props = defineProps<{ sensor: SensorView }>()

const localOn = ref<boolean | null>(props.sensor.lightOn ?? false)
const localBri = ref<number>(briFromHue(props.sensor.lightBrightness ?? 0))
const dragging = ref(false)
const error = ref<string | null>(null)
const pending = ref(false)

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
  }, 140)
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
const displayName = computed(() => props.sensor.label?.trim() || props.sensor.hueName?.trim() || `Light #${props.sensor.id}`)
</script>

<template>
  <div class="row" :class="{ 'is-on': localOn && reachable, unreachable: !reachable }">
    <button
      class="row-toggle"
      :class="{ on: localOn && reachable }"
      :disabled="pending || !reachable"
      :title="localOn ? 'Turn off' : 'Turn on'"
      @click="toggleOn"
    >
      <span class="bulb">💡</span>
    </button>

    <div class="row-info">
      <span class="row-name" :title="displayName">{{ displayName }}</span>
      <span class="row-state" :class="{ off: !localOn || !reachable, error: !!error }">
        <template v-if="!reachable">Unreachable</template>
        <template v-else-if="error">{{ error }}</template>
        <template v-else>{{ localOn ? 'On' : 'Off' }}</template>
      </span>
    </div>

    <div class="row-control">
      <input
        v-if="hasBrightness"
        v-model.number="localBri"
        type="range" min="0" max="100" step="1"
        class="row-slider"
        :disabled="!reachable"
        :title="`Brightness ${localBri}%`"
        @mousedown="dragging = true"
        @touchstart="dragging = true"
        @input="onBrightnessInput"
        @change="commitBrightness"
      />
      <span v-else class="no-bri">on/off only</span>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) minmax(120px, 220px);
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  background: #151825;
  border: 1px solid #232839;
  border-radius: 10px;
  transition: background 0.15s, border-color 0.15s;
}

.row.is-on {
  border-color: #2a3454;
  background: linear-gradient(180deg, #1a2038 0%, #151825 100%);
}

.row.unreachable {
  background: rgba(248, 113, 113, 0.06);
  border-color: rgba(248, 113, 113, 0.25);
}

.row-toggle {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid #2a2f45;
  background: #1a1d2c;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  line-height: 1;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.row-toggle .bulb {
  filter: grayscale(0.6) brightness(0.7);
  transition: filter 0.15s;
}
.row-toggle.on {
  background: #4a6fa5;
  border-color: #a0c4ff;
  box-shadow: 0 0 10px rgba(160, 196, 255, 0.35);
}
.row-toggle.on .bulb { filter: none; }
.row-toggle:disabled { opacity: 0.5; cursor: not-allowed; }

.row-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.row-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-state {
  font-size: 0.6rem;
  color: #a0c4ff;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-state.off { color: #475569; }
.row-state.error { color: #f87171; text-transform: none; letter-spacing: 0; font-size: 0.7rem; }
.row.unreachable .row-state { color: #f87171; }

.row-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.row-slider {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  border-radius: 2px;
  background: #2a2f45;
  outline: none;
  cursor: pointer;
}
.row-slider:disabled { opacity: 0.5; cursor: not-allowed; }
.row-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #a0c4ff;
  cursor: pointer;
}
.row-slider::-moz-range-thumb {
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #a0c4ff;
  cursor: pointer;
  border: 0;
}

.no-bri {
  font-size: 0.65rem;
  color: #475569;
  font-style: italic;
  text-align: right;
  width: 100%;
}
</style>
