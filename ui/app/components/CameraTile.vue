<script setup lang="ts">
import { PencilSquareIcon, XMarkIcon, PlayIcon } from '@heroicons/vue/20/solid'
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
  <button
    class="group/tile relative aspect-video w-full overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-default/70 dark:ring-white/5 cursor-pointer transition hover:ring-default dark:hover:ring-white/10"
    @click="emit('open-live', sensor.id)"
  >
    <img v-if="sensor.snapshotUrl" :src="sensor.snapshotUrl" :alt="sensor.label ?? 'Camera'" class="absolute inset-0 size-full object-cover" />
    <div v-else class="absolute inset-0 flex items-center justify-center text-subtle">
      <svg class="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
        <circle cx="12" cy="13" r="3"/>
      </svg>
    </div>
    <!-- Bottom gradient + label -->
    <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-8 pb-2.5">
      <div class="text-sm font-medium text-white text-left truncate">{{ sensor.label ?? 'Camera' }}</div>
    </div>
    <!-- Play overlay on hover -->
    <div class="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm opacity-0 transition-opacity group-hover/tile:opacity-100">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25">
        <PlayIcon class="size-4" /> Live
      </span>
    </div>
    <span v-if="recentMotion" class="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-error/90 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-white">
      <span class="size-1.5 rounded-full bg-white animate-warren-pulse" />
      Motion
    </span>

    <div v-if="editing" class="absolute top-2 right-2 flex gap-1">
      <span class="inline-flex items-center justify-center size-7 rounded-md bg-black/50 backdrop-blur ring-1 ring-white/15 text-white hover:bg-black/70 transition-colors" title="Edit" @click.stop="emit('edit-sensor', sensor.id)">
        <PencilSquareIcon class="size-3.5" />
      </span>
      <span class="inline-flex items-center justify-center size-7 rounded-md bg-black/50 backdrop-blur ring-1 ring-white/15 text-white hover:bg-error/80 transition-colors" title="Remove" @click.stop="confirmRemove = true">
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
