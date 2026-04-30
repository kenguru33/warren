<script setup lang="ts">
import { PencilSquareIcon, XMarkIcon } from '@heroicons/vue/20/solid'
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
  <button
    :class="[
      'group/tile relative flex flex-col items-start gap-1.5 rounded-2xl px-4 py-4 text-left ring-1 transition cursor-pointer',
      isOffline
        ? 'bg-error/[0.04] ring-error/30 hover:ring-error/50'
        : 'bg-surface-2/60 ring-default/70 hover:bg-surface-2 hover:ring-default dark:ring-white/5 dark:hover:ring-white/10',
    ]"
    @click="emit('view-history', sensor)"
  >
    <div class="flex items-center justify-between w-full">
      <span class="text-lg">{{ icon }}</span>
      <span v-if="isOffline" class="badge badge-error">Offline</span>
    </div>
    <div :class="['text-2xl font-bold tabular-nums leading-none mt-1', isOffline ? 'text-subtle' : 'text-text']">
      {{ formattedValue }}
    </div>
    <div class="text-xs text-subtle uppercase tracking-wider font-medium">{{ label }}</div>
    <div v-if="sensor.label" class="text-xs text-muted truncate max-w-full">{{ sensor.label }}</div>
    <div v-if="refValue !== null" class="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
      <span>Target {{ refValue }}{{ refUnit }}</span>
      <span v-if="deviation" :class="['font-semibold', deviationDirection === 'over' ? 'text-error' : 'text-success']">{{ deviation }}</span>
    </div>

    <div v-if="isTemp" class="mt-1 flex gap-1.5">
      <span :class="['inline-flex items-center transition-colors', sensor.heaterActive ? 'text-orange-500' : 'text-default']" title="Heater">
        <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M3 6 Q6 3 9 6 Q12 9 15 6 Q18 3 21 6"/>
          <path d="M3 12 Q6 9 9 12 Q12 15 15 12 Q18 9 21 12"/>
          <path d="M3 18 Q6 15 9 18 Q12 21 15 18 Q18 15 21 18"/>
        </svg>
      </span>
      <span :class="['inline-flex items-center transition-colors', sensor.fanActive ? 'text-sky-400' : 'text-default']" title="Fan">
        <svg class="size-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6.93-1A7 7 0 0 0 13 4.07V2h-2v2.07A7 7 0 0 0 5.07 10H3v2h2.07A7 7 0 0 0 11 19.93V22h2v-2.07A7 7 0 0 0 18.93 13H21v-2h-2.07zM12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/></svg>
      </span>
    </div>

    <div v-if="editing" class="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-xl bg-surface/75 p-0.5 backdrop-blur-md transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/tile:opacity-100 dark:bg-surface/65">
      <span class="btn-icon size-7" title="Edit" @click.stop="emit('edit-sensor', sensor.id)">
        <PencilSquareIcon class="size-3.5" />
      </span>
      <span class="btn-icon size-7 hover:!text-error hover:!ring-error/40" title="Remove" @click.stop="confirmRemove = true">
        <XMarkIcon class="size-3.5" />
      </span>
    </div>

    <ConfirmDialog
      v-if="confirmRemove"
      message="Remove this sensor from the room?"
      confirm-label="Remove"
      @confirm="emit('remove-sensor', sensor.id); confirmRemove = false"
      @cancel="confirmRemove = false"
    />
  </button>
</template>
