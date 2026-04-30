<script setup lang="ts">
import { PencilSquareIcon, XMarkIcon } from '@heroicons/vue/20/solid'
import type { SensorView } from '../../shared/types'

const props = defineProps<{ sensor: SensorView; editing: boolean }>()

const emit = defineEmits<{
  (e: 'edit-sensor', sensorId: number): void
  (e: 'remove-sensor', sensorId: number): void
  (e: 'toggled'): void
}>()

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
const displayName = computed(() => props.sensor.label?.trim() || props.sensor.hueName?.trim() || 'Light')
</script>

<template>
  <div
    :class="[
      'group/tile relative flex flex-col items-center gap-3 rounded-2xl px-4 pt-4 pb-3.5 ring-1 transition',
      !reachable
        ? 'bg-error/[0.04] ring-error/30'
        : 'bg-surface ring-default hover:bg-surface-2 dark:ring-white/10 dark:hover:bg-white/[0.02]',
    ]"
  >
    <button
      :class="[
        'relative flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        localOn && reachable
          ? 'bg-accent-soft text-accent-strong ring-1 ring-accent/30 dark:bg-accent/15 dark:ring-accent/30'
          : 'bg-surface ring-1 ring-default',
        (pending || !reachable) && 'opacity-50 cursor-not-allowed',
      ]"
      :disabled="pending || !reachable"
      :title="localOn ? 'Turn off' : 'Turn on'"
      @click.stop="toggleOn"
    >
      <span :class="['transition', !localOn && 'grayscale opacity-50']">💡</span>
    </button>

    <div class="flex flex-col items-center gap-0.5 w-full min-w-0 text-center">
      <span class="text-sm font-semibold text-text truncate max-w-full" :title="displayName">{{ displayName }}</span>
      <span :class="['text-[0.7rem] font-medium uppercase tracking-wider', localOn && reachable ? 'text-accent-strong' : 'text-subtle']">{{ localOn ? 'On' : 'Off' }}</span>
    </div>

    <input
      v-if="hasBrightness"
      v-model.number="localBri"
      type="range" min="0" max="100" step="1"
      class="slider slider-sm w-full"
      :disabled="!reachable"
      :title="`Brightness ${localBri}%`"
      @click.stop
      @mousedown="dragging = true"
      @touchstart="dragging = true"
      @input="onBrightnessInput"
      @change="commitBrightness"
    />

    <span v-if="!reachable" class="badge badge-error">Unreachable</span>
    <span v-if="error" class="absolute top-1.5 left-1.5 inline-flex size-4 items-center justify-center rounded-full bg-error text-[0.6rem] font-bold text-white" :title="error">!</span>

    <div v-if="editing" class="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover/tile:opacity-100">
      <button class="btn-icon size-7" title="Edit" @click.stop="emit('edit-sensor', sensor.id)">
        <PencilSquareIcon class="size-3.5" />
      </button>
      <button class="btn-icon size-7 hover:!text-error hover:!ring-error/40" title="Remove" @click.stop="confirmRemove = true">
        <XMarkIcon class="size-3.5" />
      </button>
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
