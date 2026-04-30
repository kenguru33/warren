<script setup lang="ts">
import type { MasterState } from '../../shared/types'

const props = defineProps<{
  master: MasterState
  pending?: boolean
  error?: string | null
  partial?: { ok: number; failed: number } | null
  label?: string
  variant?: 'compact' | 'wide'
}>()

const emit = defineEmits<{
  (e: 'toggle', nextOn: boolean): void
}>()

// mixed → first tap is ON. all-on → OFF. all-off → ON.
const nextOn = computed(() => props.master.state !== 'all-on')
const isOn = computed(() => props.master.state === 'all-on' || props.master.state === 'mixed')
const isMixed = computed(() => props.master.state === 'mixed')

const stateLabel = computed(() => {
  if (props.master.state === 'all-on') return 'All on'
  if (props.master.state === 'mixed') return 'Mixed'
  return 'All off'
})

function onClick() {
  if (props.pending) return
  emit('toggle', nextOn.value)
}
</script>

<template>
  <!-- Wide variant — hero element on /lights and dashboard. -->
  <div
    v-if="variant === 'wide'"
    :class="[
      'inline-flex w-full items-center gap-3 rounded-xl px-5 py-4 ring-1 transition shadow-sm',
      isOn && !isMixed
        ? 'bg-accent/10 ring-accent/30'
        : isMixed
          ? 'bg-warning/10 ring-warning/30'
          : 'bg-surface ring-default/70 dark:ring-white/10',
      pending && 'opacity-70',
    ]"
  >
    <button
      :class="[
        'group relative isolate inline-flex h-5 w-8 shrink-0 cursor-pointer rounded-full p-[3px] align-middle',
        'ring-1 ring-inset transition-colors duration-200 ease-in-out',
        'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        isMixed
          ? 'bg-warning ring-warning'
          : isOn
            ? 'bg-accent ring-accent-strong/40 dark:bg-accent dark:ring-transparent'
            : 'bg-strong/40 ring-default dark:bg-white/5 dark:ring-white/15',
        pending && 'cursor-not-allowed',
      ]"
      :disabled="pending"
      :title="nextOn ? 'Turn all on' : 'Turn all off'"
      @click="onClick"
    >
      <span
        aria-hidden="true"
        :class="[
          'pointer-events-none relative inline-block size-3.5 rounded-full bg-white shadow-sm',
          'ring-1 ring-black/5 transition-transform duration-200 ease-in-out',
          isMixed ? 'translate-x-1.5' : isOn ? 'translate-x-3' : 'translate-x-0',
        ]"
      />
    </button>

    <div class="flex flex-col leading-tight min-w-0">
      <span v-if="label" class="text-[0.7rem] font-semibold uppercase tracking-wide text-subtle">{{ label }}</span>
      <span :class="['text-sm font-semibold', isOn ? 'text-text' : 'text-muted']">{{ stateLabel }}</span>
      <span class="text-[0.7rem] text-subtle">{{ master.memberCount }} {{ master.memberCount === 1 ? 'light' : 'lights' }}</span>
    </div>

    <div class="ml-auto flex flex-wrap gap-1.5">
      <span v-if="master.unreachableCount > 0" class="badge badge-error" :title="`${master.unreachableCount} unreachable`">
        {{ master.unreachableCount }} offline
      </span>
      <span v-if="partial" class="badge badge-warning" :title="`${partial.failed} failed`">
        {{ partial.failed }} failed
      </span>
      <span v-if="error" class="badge badge-error" :title="error">!</span>
    </div>
  </div>

  <!-- Compact variant — sits inline with room title + icon buttons.
       Keep the height around 32 px so it lines up with `btn-icon !size-8`. -->
  <div v-else class="inline-flex h-8 items-center gap-2">
    <button
      :class="[
        'group relative isolate inline-flex h-5 w-8 shrink-0 cursor-pointer rounded-full p-[3px] align-middle',
        'ring-1 ring-inset transition-colors duration-200 ease-in-out',
        'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        isMixed
          ? 'bg-warning ring-warning'
          : isOn
            ? 'bg-accent ring-accent-strong/40 dark:bg-accent dark:ring-transparent'
            : 'bg-strong/40 ring-default dark:bg-white/5 dark:ring-white/15',
        pending && 'cursor-not-allowed opacity-70',
      ]"
      :disabled="pending"
      :title="`${stateLabel} — ${nextOn ? 'turn all on' : 'turn all off'}`"
      :aria-label="nextOn ? 'Turn all lights on' : 'Turn all lights off'"
      @click="onClick"
    >
      <span
        aria-hidden="true"
        :class="[
          'pointer-events-none relative inline-block size-3.5 rounded-full bg-white shadow-sm',
          'ring-1 ring-black/5 transition-transform duration-200 ease-in-out',
          isMixed ? 'translate-x-1.5' : isOn ? 'translate-x-3' : 'translate-x-0',
        ]"
      />
    </button>
    <span class="text-sm/5 font-medium text-muted">{{ stateLabel }}</span>
    <span class="text-xs/5 text-subtle tabular-nums">· {{ master.memberCount }}</span>
    <span v-if="master.unreachableCount > 0" class="badge badge-error" :title="`${master.unreachableCount} unreachable`">
      {{ master.unreachableCount }}
    </span>
    <span v-if="partial" class="badge badge-warning" :title="`${partial.failed} failed`">!</span>
    <span v-if="error" class="badge badge-error" :title="error">!</span>
  </div>
</template>
