<script setup lang="ts">
import { PencilSquareIcon, XMarkIcon } from '@heroicons/vue/20/solid'
import type { LightGroupView, SensorView } from '../../shared/types'

const props = defineProps<{
  group: LightGroupView
  members: SensorView[]
  editing: boolean
}>()

const emit = defineEmits<{
  (e: 'edit-group', groupId: number): void
  (e: 'ungroup', groupId: number): void
  (e: 'open-detail', groupId: number): void
  (e: 'toggled'): void
}>()

const confirmUngroup = ref(false)

const localOn = ref<boolean | null>(null)
const localBri = ref<number | null>(null)
const dragging = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)
const partial = ref<{ ok: number; failed: number } | null>(null)

watch(() => props.group, () => {
  if (!pending.value) localOn.value = null
  if (!dragging.value && !pending.value) localBri.value = null
}, { deep: true })

const displayState = computed<'all-on' | 'all-off' | 'mixed'>(() => {
  if (localOn.value !== null) return localOn.value ? 'all-on' : 'all-off'
  return props.group.state
})

const isOn = computed(() => displayState.value === 'all-on' || displayState.value === 'mixed')

const displayBri = computed<number>(() => {
  if (localBri.value !== null) return localBri.value
  return props.group.brightness ?? 0
})

const stateLabel = computed(() => {
  const onCount = props.members.filter(m => m.lightOn === true && m.lightReachable !== false).length
  const total = props.members.filter(m => m.lightReachable !== false).length
  if (displayState.value === 'mixed') return `${onCount} of ${total} on`
  if (displayState.value === 'all-on') return total === 1 ? 'On' : 'All on'
  return total === 0 ? 'Offline' : 'All off'
})

const statusUrl = computed(() => `/api/light-groups/${props.group.id}/state`)

async function toggleMaster() {
  const next = displayState.value !== 'all-on'
  localOn.value = next
  pending.value = true
  error.value = null
  partial.value = null
  try {
    const res = await $fetch<{ successCount: number; failureCount: number; total: number }>(
      statusUrl.value,
      { method: 'POST', body: { on: next } },
    )
    if (res.failureCount > 0) {
      partial.value = { ok: res.successCount, failed: res.failureCount }
    }
    emit('toggled')
  } catch (err: unknown) {
    localOn.value = null
    const e = err as { data?: { error?: string }; message?: string }
    error.value = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed')
  } finally {
    pending.value = false
  }
}

let briThrottleTimer: ReturnType<typeof setTimeout> | null = null
let lastSentBri = -1

async function sendBrightness(value: number) {
  if (value === lastSentBri) return
  lastSentBri = value
  error.value = null
  partial.value = null
  try {
    const body: { brightness: number; on?: boolean } = { brightness: value }
    if (value > 0 && displayState.value !== 'all-on') {
      body.on = true
      localOn.value = true
    }
    const res = await $fetch<{ successCount: number; failureCount: number; total: number }>(
      statusUrl.value,
      { method: 'POST', body },
    )
    if (res.failureCount > 0) {
      partial.value = { ok: res.successCount, failed: res.failureCount }
    }
    emit('toggled')
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    error.value = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed')
  }
}

function onBrightnessInput(e: Event) {
  dragging.value = true
  localBri.value = Number((e.target as HTMLInputElement).value)
  if (briThrottleTimer !== null) return
  briThrottleTimer = setTimeout(() => {
    briThrottleTimer = null
    if (localBri.value !== null) sendBrightness(localBri.value)
  }, 140)
}

async function commitBrightness() {
  dragging.value = false
  if (briThrottleTimer) {
    clearTimeout(briThrottleTimer)
    briThrottleTimer = null
  }
  if (localBri.value === null) return
  pending.value = true
  try {
    await sendBrightness(localBri.value)
  } finally {
    pending.value = false
  }
}

onUnmounted(() => {
  if (briThrottleTimer) clearTimeout(briThrottleTimer)
})

const { theme: mode } = useTheme()
const theme = computed(() => resolveLightTheme(props.group.theme, mode.value))
const themeVars = computed(() => ({
  '--theme-on-border':    theme.value.onBorder,
  '--theme-on-glow':      theme.value.onGlow,
  '--theme-on-bg':        theme.value.toggleOnBg,
  '--theme-bulb-tint':    theme.value.bulbTint,
  '--theme-mixed-ring':   theme.value.mixedRingOverride ?? MIXED_RING_DEFAULT,
}))
</script>

<template>
  <div
    :class="[
      'group/tile relative flex flex-col items-center gap-3 rounded-2xl px-4 pt-4 pb-3.5 ring-1 transition cursor-pointer',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-on-border)]',
      displayState === 'mixed'
        ? 'bg-surface ring-warning/60 hover:bg-surface-2 dark:ring-warning/40 dark:hover:bg-white/[0.02]'
        : 'bg-surface ring-default hover:bg-surface-2 dark:ring-white/10 dark:hover:bg-white/[0.02]',
    ]"
    :style="themeVars"
    role="button"
    tabindex="0"
    @click="emit('open-detail', group.id)"
    @keydown.enter.self.prevent="emit('open-detail', group.id)"
    @keydown.space.self.prevent="emit('open-detail', group.id)"
  >
    <button
      :class="[
        'relative flex h-12 w-16 shrink-0 items-center justify-center rounded-2xl transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        isOn && displayState !== 'mixed'
          ? 'bg-[var(--theme-on-bg)] ring-1 ring-[var(--theme-on-border)]/30'
          : 'bg-surface ring-1 ring-default',
        displayState === 'mixed' && '!ring-warning/60 dark:!ring-warning/40',
        (pending || group.memberCount === 0) && 'opacity-50 cursor-not-allowed',
      ]"
      :disabled="pending || group.memberCount === 0"
      :title="isOn ? 'Turn group off' : 'Turn group on'"
      @click.stop="toggleMaster"
    >
      <span class="relative inline-flex w-9 h-5" aria-hidden="true">
        <span
          :class="[
            'absolute top-0 left-0 text-base leading-none rotate-[-14deg] translate-y-0.5 opacity-70 transition',
            isOn && 'opacity-100 drop-shadow-[0_0_4px_var(--theme-bulb-tint)]',
            !isOn && 'grayscale opacity-50',
          ]"
        >💡</span>
        <span
          :class="[
            'absolute top-0 left-2.5 text-base leading-none -translate-y-px z-10 transition',
            isOn && 'drop-shadow-[0_0_4px_var(--theme-bulb-tint)]',
            !isOn && 'grayscale opacity-50',
          ]"
        >💡</span>
        <span
          :class="[
            'absolute top-0 left-5 text-base leading-none rotate-[14deg] translate-y-0.5 opacity-70 transition',
            isOn && 'opacity-100 drop-shadow-[0_0_4px_var(--theme-bulb-tint)]',
            !isOn && 'grayscale opacity-50',
          ]"
        >💡</span>
      </span>
    </button>

    <div class="flex flex-col items-center gap-0.5 w-full min-w-0 text-center">
      <span class="text-sm font-semibold text-text truncate max-w-full" :title="group.name">{{ group.name }}</span>
      <span class="text-[0.7rem] font-medium text-subtle">
        {{ stateLabel }} · {{ group.memberCount }}
      </span>
    </div>

    <input
      v-if="group.hasBrightnessCapableMember"
      :value="displayBri"
      type="range" min="0" max="100" step="1"
      class="slider slider-sm w-full"
      :disabled="group.memberCount === 0"
      :title="`Brightness ${displayBri}%`"
      @click.stop
      @input="onBrightnessInput"
      @change="commitBrightness"
    />

    <div v-if="group.unreachableCount > 0 || partial" class="flex flex-wrap justify-center gap-1.5">
      <span v-if="group.unreachableCount > 0" class="badge badge-error" :title="`${group.unreachableCount} unreachable`">
        {{ group.unreachableCount }} offline
      </span>
      <span v-if="partial" class="badge badge-warning" :title="`${partial.failed} failed`">
        {{ partial.failed }} failed
      </span>
    </div>
    <span v-if="error" class="absolute top-1.5 left-1.5 inline-flex size-4 items-center justify-center rounded-full bg-error text-[0.6rem] font-bold text-white" :title="error">!</span>

    <div v-if="editing" class="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover/tile:opacity-100">
      <button class="btn-icon size-7" title="Edit group" @click.stop="emit('edit-group', group.id)">
        <PencilSquareIcon class="size-3.5" />
      </button>
      <button class="btn-icon size-7 hover:!text-error hover:!ring-error/40" title="Ungroup" @click.stop="confirmUngroup = true">
        <XMarkIcon class="size-3.5" />
      </button>
    </div>

    <ConfirmDialog
      v-if="confirmUngroup"
      :message="`Ungroup &quot;${group.name}&quot;? The lights stay in the room and become individually controllable again.`"
      confirm-label="Ungroup"
      @confirm="emit('ungroup', group.id); confirmUngroup = false"
      @cancel="confirmUngroup = false"
    />
  </div>
</template>
