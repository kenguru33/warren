<script setup lang="ts">
import { ArrowUpOnSquareIcon, XMarkIcon } from '@heroicons/vue/20/solid'

const { shouldShow, dismiss } = useIosInstallHint()
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-4 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-4 opacity-0"
  >
    <div
      v-if="shouldShow"
      class="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl bg-modal p-3 shadow-lg ring-1 ring-default pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:ring-white/10"
    >
      <ArrowUpOnSquareIcon class="mt-0.5 size-5 shrink-0 text-subtle" />
      <p class="flex-1 text-sm/5 text-text">
        Install on iPhone: tap the Share icon then <span class="font-semibold">Add to Home Screen</span>.
      </p>
      <button
        type="button"
        class="-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-subtle hover:bg-default hover:text-text"
        aria-label="Dismiss"
        @click="dismiss"
      >
        <XMarkIcon class="size-4" />
      </button>
    </div>
  </Transition>
</template>
