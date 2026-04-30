<script setup lang="ts">
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  TransitionChild,
  TransitionRoot,
} from '@headlessui/vue'

withDefaults(defineProps<{
  open: boolean
  title?: string
  // Tailwind max-w-* class. Override per modal that needs more width.
  maxWidthClass?: string
}>(), {
  title: undefined,
  maxWidthClass: 'max-w-md',
})

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <TransitionRoot :show="open" as="template" appear>
    <Dialog as="div" class="relative z-50" @close="emit('close')">
      <TransitionChild
        as="template"
        enter="duration-200 ease-out"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="duration-150 ease-in"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-sm" />
      </TransitionChild>

      <div class="fixed inset-0 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4 sm:p-6">
          <TransitionChild
            as="template"
            enter="duration-200 ease-out"
            enter-from="opacity-0 translate-y-2 sm:scale-95"
            enter-to="opacity-100 translate-y-0 sm:scale-100"
            leave="duration-150 ease-in"
            leave-from="opacity-100 translate-y-0 sm:scale-100"
            leave-to="opacity-0 translate-y-2 sm:scale-95"
          >
            <DialogPanel
              :class="[
                'relative w-full bg-modal text-text rounded-2xl shadow-2xl ring-1 ring-default/70 dark:ring-white/10',
                'flex flex-col max-h-[88vh]',
                maxWidthClass,
              ]"
            >
              <DialogTitle
                v-if="title"
                class="px-6 pt-5 pb-4 text-base font-semibold text-text border-b border-default"
              >
                {{ title }}
              </DialogTitle>
              <slot />
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
