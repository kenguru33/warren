<script setup lang="ts">
import { PencilSquareIcon, XMarkIcon } from '@heroicons/vue/20/solid'
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
  <button
    :class="[
      'group/tile relative flex flex-col items-start gap-1.5 rounded-2xl px-4 py-4 text-left ring-1 transition cursor-pointer',
      isOffline
        ? 'bg-error/[0.04] ring-error/30'
        : recentMotion
          ? 'bg-accent/10 ring-accent/30'
          : 'bg-surface-2/60 ring-default/70 hover:bg-surface-2 hover:ring-default dark:ring-white/5 dark:hover:ring-white/10',
    ]"
    @click="emit('view-history', sensor)"
  >
    <div class="flex items-center justify-between w-full">
      <span class="text-lg">🏃</span>
      <span v-if="isOffline" class="badge badge-error">Offline</span>
      <span v-else-if="recentMotion" class="badge badge-warning animate-warren-pulse">Live</span>
    </div>
    <div :class="['text-2xl font-bold leading-none mt-1', isOffline ? 'text-subtle' : recentMotion ? 'text-warning' : 'text-text']">
      {{ valueText }}
    </div>
    <div class="text-xs text-subtle uppercase tracking-wider font-medium">Motion</div>
    <div v-if="sensor.label" class="text-xs text-muted truncate max-w-full">{{ sensor.label }}</div>
    <div v-if="sensor.lastMotion && motionLabel" class="text-xs text-subtle">{{ motionLabel }}</div>

    <div v-if="editing" class="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover/tile:opacity-100">
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
