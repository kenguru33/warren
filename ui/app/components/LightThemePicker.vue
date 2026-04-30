<script setup lang="ts">
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/vue'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/vue/20/solid'
import type { LightThemeKey } from '../../shared/utils/light-themes'

const props = defineProps<{ modelValue: LightThemeKey }>()

const emit = defineEmits<{
  (e: 'update:modelValue', key: LightThemeKey): void
}>()

const themes = Object.values(LIGHT_THEMES)
const selectedTheme = computed(() => LIGHT_THEMES[props.modelValue])
</script>

<template>
  <Listbox
    :model-value="modelValue"
    as="div"
    class="relative w-full"
    @update:model-value="(v: LightThemeKey) => emit('update:modelValue', v)"
  >
    <ListboxButton
      class="relative w-full cursor-pointer rounded-lg bg-input py-2 pl-3 pr-10 text-left text-sm text-text shadow-sm ring-1 ring-inset ring-default focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent transition dark:ring-white/10 dark:shadow-none"
    >
      <span class="flex items-center gap-3">
        <span
          class="size-4 shrink-0 rounded-full ring-1 ring-white/10 shadow-sm"
          :style="{ background: selectedTheme.swatch }"
          aria-hidden="true"
        />
        <span class="font-medium">{{ selectedTheme.label }}</span>
      </span>
      <span class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
        <ChevronUpDownIcon class="size-4 text-subtle" aria-hidden="true" />
      </span>
    </ListboxButton>

    <transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <ListboxOptions
        class="pretty-scroll absolute z-30 mt-1.5 w-full max-h-[60vh] overflow-y-auto rounded-lg bg-modal py-1 text-sm shadow-lg ring-1 ring-default focus:outline-none dark:ring-white/10"
      >
        <ListboxOption
          v-for="t in themes"
          :key="t.key"
          v-slot="{ active, selected }"
          :value="t.key"
          as="template"
        >
          <li
            :class="[
              'relative cursor-pointer select-none mx-1 my-0.5 rounded-md py-2 pl-3 pr-9 flex items-center gap-3',
              active ? 'bg-accent/10 text-text' : 'text-muted',
            ]"
          >
            <span
              class="size-4 shrink-0 rounded-full ring-1 ring-white/10 shadow-sm"
              :style="{ background: t.swatch }"
              aria-hidden="true"
            />
            <span :class="['font-medium', selected && 'text-accent-strong']">{{ t.label }}</span>
            <span class="ml-auto flex gap-1" aria-hidden="true">
              <span
                v-for="c in t.bulbPalette"
                :key="c"
                class="size-2.5 rounded-full ring-1 ring-white/10"
                :style="{ background: c }"
              />
            </span>
            <CheckIcon v-if="selected" class="absolute right-2.5 size-4 text-accent" aria-hidden="true" />
          </li>
        </ListboxOption>
      </ListboxOptions>
    </transition>
  </Listbox>
</template>
