<script setup lang="ts">
import { Switch } from '@headlessui/vue'

defineProps<{
  modelValue: boolean
  disabled?: boolean
  label?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()
</script>

<template>
  <Switch
    :model-value="modelValue"
    :disabled="disabled"
    :class="[
      'group relative isolate inline-flex h-5 w-8 shrink-0 cursor-pointer rounded-full p-[3px] align-middle',
      'ring-1 ring-inset transition-colors duration-200 ease-in-out',
      modelValue
        ? 'bg-accent ring-accent-strong/40 dark:bg-accent dark:ring-transparent'
        : 'bg-strong/40 ring-default dark:bg-white/5 dark:ring-white/15',
      'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      disabled && 'opacity-50 cursor-not-allowed',
    ]"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <span class="sr-only">{{ label ?? 'Toggle' }}</span>
    <span
      aria-hidden="true"
      :class="[
        'pointer-events-none relative inline-block size-3.5 rounded-full bg-white shadow-sm',
        'ring-1 ring-black/5 transition-transform duration-200 ease-in-out',
        modelValue ? 'translate-x-3' : 'translate-x-0',
      ]"
    />
  </Switch>
</template>
