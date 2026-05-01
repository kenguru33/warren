<script setup lang="ts">
import { ArrowDownTrayIcon } from '@heroicons/vue/20/solid'

const { canInstall, install } = useInstallPrompt()

async function onClick() {
  await install()
}
</script>

<template>
  <button
    v-if="canInstall"
    class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm/5 text-text hover:bg-default"
    @click="onClick"
  >
    <ArrowDownTrayIcon class="size-4 text-subtle" />
    <span>Install Warren</span>
  </button>
</template>
