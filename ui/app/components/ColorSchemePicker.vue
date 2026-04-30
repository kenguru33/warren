<script setup lang="ts">
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/vue'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/vue/20/solid'
import type { ColorSchemeKey } from '../composables/useColorScheme'

interface SchemeOption {
  key: ColorSchemeKey
  label: string
  swatch: string
}

const SCHEMES: readonly SchemeOption[] = [
  { key: 'zinc-indigo',     label: 'Modern',  swatch: '#4f46e5' },
  { key: 'slate-sky',       label: 'Tech',    swatch: '#0284c7' },
  { key: 'stone-amber',     label: 'Warm',    swatch: '#d97706' },
  { key: 'neutral-emerald', label: 'Forest',  swatch: '#059669' },
  { key: 'gray-rose',       label: 'Rose',    swatch: '#e11d48' },
  { key: 'zinc-violet',     label: 'Violet',  swatch: '#7c3aed' },
] as const

const { colorScheme, setColorScheme } = useColorScheme()
const selected = computed(() =>
  SCHEMES.find(s => s.key === colorScheme.value) ?? SCHEMES[0]!,
)
</script>

<template>
  <Listbox
    :model-value="colorScheme"
    as="div"
    class="relative w-full"
    @update:model-value="(v: ColorSchemeKey) => setColorScheme(v)"
  >
    <ListboxButton
      class="relative w-full cursor-pointer rounded-lg bg-input py-1.5 pl-3 pr-9 text-left text-xs/5 text-text shadow-sm ring-1 ring-inset ring-default focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent transition dark:ring-white/10 dark:shadow-none"
    >
      <span class="flex items-center gap-2">
        <span
          class="size-3.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10 shadow-sm"
          :style="{ background: selected.swatch }"
          aria-hidden="true"
        />
        <span class="truncate font-medium">{{ selected.label }}</span>
      </span>
      <span class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
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
        class="pretty-scroll absolute z-30 bottom-full mb-1.5 w-full max-h-[60vh] overflow-y-auto rounded-lg bg-modal py-1 text-sm shadow-lg ring-1 ring-default focus:outline-none dark:ring-white/10"
      >
        <ListboxOption
          v-for="s in SCHEMES"
          :key="s.key"
          v-slot="{ active, selected: isSelected }"
          :value="s.key"
          as="template"
        >
          <li
            :class="[
              'relative cursor-pointer select-none mx-1 my-0.5 rounded-md py-2 pl-3 pr-9 flex items-center gap-3',
              active ? 'bg-accent/10 text-text' : 'text-muted',
            ]"
          >
            <span
              class="size-4 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10 shadow-sm"
              :style="{ background: s.swatch }"
              aria-hidden="true"
            />
            <span :class="['font-medium', isSelected && 'text-accent-strong']">{{ s.label }}</span>
            <CheckIcon v-if="isSelected" class="absolute right-2.5 size-4 text-accent" aria-hidden="true" />
          </li>
        </ListboxOption>
      </ListboxOptions>
    </transition>
  </Listbox>
</template>
