<script setup lang="ts">
import { PencilSquareIcon } from '@heroicons/vue/20/solid'
import type { SensorView } from '../../shared/types'

const props = defineProps<{ sensor: SensorView }>()

const emit = defineEmits<{
  (e: 'toggled'): void
  (e: 'edit-sensor', sensorId: number): void
}>()

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
    emit('toggled')
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
    emit('toggled')
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
  <div
    :class="[
      'grid grid-cols-[40px_minmax(0,1fr)_minmax(120px,220px)_auto] items-center gap-4 px-3 py-2.5 rounded-xl ring-1 transition-colors',
      !reachable
        ? 'bg-error/5 ring-error/25'
        : localOn
          ? 'bg-accent/10 ring-accent/30'
          : 'bg-surface-2/60 ring-default/70 dark:ring-white/5',
    ]"
  >
    <button
      :class="[
        'flex size-9 items-center justify-center rounded-xl text-lg transition-all',
        localOn && reachable
          ? 'bg-accent text-white shadow-md shadow-accent/40 ring-1 ring-accent/50'
          : 'bg-surface ring-1 ring-default',
        (pending || !reachable) && 'opacity-50 cursor-not-allowed',
      ]"
      :disabled="pending || !reachable"
      :title="localOn ? 'Turn off' : 'Turn on'"
      @click="toggleOn"
    >
      <span :class="!(localOn && reachable) && 'grayscale opacity-50'">💡</span>
    </button>

    <div class="flex flex-col gap-0.5 min-w-0">
      <span class="text-sm font-semibold text-text truncate" :title="displayName">{{ displayName }}</span>
      <span
        v-if="error"
        class="text-xs text-error truncate"
      >{{ error }}</span>
      <span
        v-else
        :class="[
          'text-[0.7rem] font-medium uppercase tracking-wider truncate',
          !reachable ? 'text-error' : localOn ? 'text-warning' : 'text-subtle',
        ]"
      >
        <template v-if="!reachable">Unreachable</template>
        <template v-else>{{ localOn ? 'On' : 'Off' }}</template>
      </span>
    </div>

    <div class="flex items-center justify-end">
      <input
        v-if="hasBrightness"
        v-model.number="localBri"
        type="range" min="0" max="100" step="1"
        class="slider slider-sm w-full"
        :disabled="!reachable"
        :title="`Brightness ${localBri}%`"
        @mousedown="dragging = true"
        @touchstart="dragging = true"
        @input="onBrightnessInput"
        @change="commitBrightness"
      />
      <span v-else class="w-full text-right text-xs italic text-subtle">on/off only</span>
    </div>

    <button
      class="btn-icon size-8 shrink-0"
      title="Edit light"
      @click.stop="emit('edit-sensor', sensor.id)"
    >
      <PencilSquareIcon class="size-4" />
    </button>
  </div>
</template>
