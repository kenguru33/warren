<script setup lang="ts">
import { SunIcon, MoonIcon } from '@heroicons/vue/24/outline'

const { theme, toggleTheme } = useTheme()
</script>

<template>
  <button
    type="button"
    class="btn-icon"
    :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggleTheme"
  >
    <SunIcon v-if="theme === 'dark'" class="size-4" />
    <MoonIcon v-else class="size-4" />
  </button>
</template>
