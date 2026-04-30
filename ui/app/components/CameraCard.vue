<script setup lang="ts">
import { PlayIcon } from '@heroicons/vue/20/solid'

const props = defineProps<{
  id: string
  name: string
  location: string
  snapshotUrl: string | null
  lastMotion: Date | null
  streamUrl: string | null
}>()

const emit = defineEmits<{
  (e: 'open-live', id: string): void
}>()

function formatMotion(date: Date | null) {
  if (!date) return null
  const diff = Math.round((Date.now() - date.getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`
  return `${Math.round(diff / 3600)}h ago`
}

const motionLabel = computed(() => formatMotion(props.lastMotion))
const recentMotion = computed(() =>
  props.lastMotion ? Date.now() - props.lastMotion.getTime() < 5 * 60 * 1000 : false
)
</script>

<template>
  <div class="card overflow-hidden transition hover:ring-default dark:hover:ring-white/10">
    <button
      class="group/snapshot relative aspect-video w-full bg-surface-2 cursor-pointer overflow-hidden block"
      @click="emit('open-live', id)"
    >
      <img v-if="snapshotUrl" :src="snapshotUrl" :alt="name" class="size-full object-cover" />
      <div v-else class="size-full flex flex-col items-center justify-center gap-2.5 text-subtle text-sm">
        <svg class="size-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
          <circle cx="12" cy="13" r="3"/>
        </svg>
        <span>No snapshot</span>
      </div>
      <div class="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm opacity-0 transition-opacity group-hover/snapshot:opacity-100">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25">
          <PlayIcon class="size-4" /> Live
        </span>
      </div>
      <span v-if="recentMotion" class="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-error/90 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-white">
        <span class="size-1.5 rounded-full bg-white animate-warren-pulse" />
        Motion
      </span>
    </button>

    <div class="flex items-center justify-between gap-3 px-4 py-3">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-text truncate">{{ name }}</p>
        <p class="text-xs text-subtle mt-0.5 truncate">{{ location }}</p>
      </div>
      <span
        v-if="motionLabel"
        :class="['text-xs whitespace-nowrap', recentMotion ? 'text-error font-medium' : 'text-subtle']"
      >
        {{ motionLabel }}
      </span>
    </div>
  </div>
</template>
