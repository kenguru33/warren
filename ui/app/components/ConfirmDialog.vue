<script setup lang="ts">
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'

withDefaults(defineProps<{
  message: string
  confirmLabel?: string
  title?: string
}>(), {
  confirmLabel: 'Delete',
  title: 'Are you sure?',
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <AppDialog :open="true" max-width-class="max-w-md" @close="emit('cancel')">
    <div class="px-6 py-6 sm:flex sm:items-start gap-4">
      <div class="mx-auto flex size-10 shrink-0 items-center justify-center rounded-full bg-error/10 ring-1 ring-error/20 sm:mx-0">
        <ExclamationTriangleIcon class="size-5 text-error" aria-hidden="true" />
      </div>
      <div class="mt-3 text-center sm:mt-0 sm:text-left">
        <h3 class="text-base font-semibold text-text">{{ title }}</h3>
        <p class="mt-2 text-sm text-muted leading-relaxed">{{ message }}</p>
      </div>
    </div>
    <div class="px-6 pb-5 pt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button class="btn-secondary" @click="emit('cancel')">Cancel</button>
      <button class="btn-danger" @click="emit('confirm')">{{ confirmLabel }}</button>
    </div>
  </AppDialog>
</template>
