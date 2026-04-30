<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/20/solid'

defineProps<{
  cameraName: string
  streamUrl: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <AppDialog :open="true" max-width-class="max-w-4xl" @close="emit('close')">
    <div class="flex items-center gap-3 px-5 py-3 border-b border-default">
      <span class="flex-1 text-base/6 font-semibold text-text truncate">{{ cameraName }}</span>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-error/10 px-2.5 py-1 ring-1 ring-error/30">
        <span class="size-1.5 rounded-full bg-error animate-warren-pulse" />
        <span class="text-xs font-bold text-error tracking-wider">LIVE</span>
      </span>
      <button class="btn-icon size-8" aria-label="Close" @click="emit('close')">
        <XMarkIcon class="size-4" />
      </button>
    </div>
    <div class="aspect-video bg-black overflow-hidden rounded-b-2xl">
      <div v-if="!streamUrl" class="size-full flex flex-col items-center justify-center gap-3.5 text-white/60 text-sm">
        <svg class="size-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
          <circle cx="12" cy="13" r="3"/>
        </svg>
        <p>Stream URL not configured</p>
      </div>
      <img v-else :src="streamUrl" alt="Live stream" class="size-full object-contain block" />
    </div>
  </AppDialog>
</template>
