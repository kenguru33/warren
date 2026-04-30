<script setup lang="ts">
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
  } catch (err: unknown) {
    localOn.value = null
    const e = err as { data?: { error?: string }; message?: string }
    error.value = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed')
  } finally {
    pending.value = false
  }
}

// Live brightness — same throttle pattern as HueLightTile so the group dims/brightens
// as the slider moves, without flooding the bridge. `pending` stays off mid-drag.
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

const theme = computed(() => resolveLightTheme(props.group.theme))
const themeVars = computed(() => ({
  '--theme-off-border':   theme.value.offBorder,
  '--theme-on-border':    theme.value.onBorder,
  '--theme-on-glow':      theme.value.onGlow,
  '--theme-on-bg':        theme.value.toggleOnBg,
  '--theme-on-grad-from': theme.value.onGradientFrom,
  '--theme-on-grad-to':   theme.value.onGradientTo,
  '--theme-bulb-tint':    theme.value.bulbTint,
  '--theme-mixed-ring':   theme.value.mixedRingOverride ?? MIXED_RING_DEFAULT,
}))
</script>

<template>
  <div
    class="sensor-tile group-tile"
    :class="{ 'is-on': isOn, 'is-mixed': displayState === 'mixed' }"
    :style="themeVars"
    role="button"
    tabindex="0"
    @click="emit('open-detail', group.id)"
    @keydown.enter.self.prevent="emit('open-detail', group.id)"
    @keydown.space.self.prevent="emit('open-detail', group.id)"
  >
    <button
      class="toggle-btn"
      :class="{ on: isOn, mixed: displayState === 'mixed' }"
      :disabled="pending || group.memberCount === 0"
      :title="isOn ? 'Turn group off' : 'Turn group on'"
      @click.stop="toggleMaster"
    >
      <span class="bulb-stack" aria-hidden="true">
        <span class="bulb b-back">💡</span>
        <span class="bulb b-front">💡</span>
        <span class="bulb b-side">💡</span>
      </span>
    </button>

    <div class="chip-text">
      <span class="chip-name" :title="group.name">{{ group.name }}</span>
      <span class="chip-state" :class="{ off: displayState === 'all-off' }">
        {{ stateLabel }}
        <span class="chip-count">· {{ group.memberCount }}</span>
      </span>
    </div>

    <input
      v-if="group.hasBrightnessCapableMember"
      :value="displayBri"
      type="range" min="0" max="100" step="1"
      class="bri-slider"
      :disabled="group.memberCount === 0"
      :title="`Brightness ${displayBri}%`"
      @click.stop
      @input="onBrightnessInput"
      @change="commitBrightness"
    />

    <div v-if="group.unreachableCount > 0 || partial" class="badge-row">
      <span v-if="group.unreachableCount > 0" class="badge unreachable" :title="`${group.unreachableCount} light(s) unreachable`">
        {{ group.unreachableCount }} unreachable
      </span>
      <span v-if="partial" class="badge partial" :title="`${partial.failed} member(s) failed`">
        {{ partial.failed }} failed
      </span>
    </div>
    <span v-if="error" class="error-badge" :title="error">!</span>

    <div v-if="editing" class="tile-actions">
      <button class="tile-action-btn" title="Edit group" @click.stop="emit('edit-group', group.id)">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>
      </button>
      <button class="tile-action-btn ungroup" title="Ungroup" @click.stop="confirmUngroup = true">×</button>
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

<style scoped>
.sensor-tile {
  background: #151825;
  border-radius: 12px;
  padding: 18px 14px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  position: relative;
  min-height: 156px;
  text-align: center;
  border: 1px solid var(--theme-off-border);
}

.group-tile {
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.group-tile:hover {
  border-color: var(--theme-on-border);
  box-shadow: 0 0 10px var(--theme-on-glow);
}
.group-tile:focus-visible {
  outline: 2px solid var(--theme-on-border);
  outline-offset: 2px;
}

.group-tile.is-on {
  background: linear-gradient(180deg, var(--theme-on-grad-from) 0%, var(--theme-on-grad-to) 100%);
  border-color: var(--theme-on-border);
}
.group-tile.is-mixed {
  border-color: var(--theme-mixed-ring);
}

.toggle-btn {
  position: relative;
  width: 64px;
  height: 42px;
  padding: 0;
  border-radius: 21px;
  border: 1px solid #2a2f45;
  background: #1a1d2c;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.toggle-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.bulb-stack {
  position: relative;
  width: 42px;
  height: 22px;
}
.bulb-stack .bulb {
  position: absolute;
  font-size: 1rem;
  line-height: 1;
  top: 0;
  filter: grayscale(0.6) brightness(0.7);
  transition: filter 0.15s, transform 0.15s;
}
.bulb-stack .b-back  { left: 0;  transform: rotate(-14deg) translateY(2px); opacity: 0.65; }
.bulb-stack .b-side  { left: 21px; transform: rotate(14deg) translateY(2px); opacity: 0.65; }
.bulb-stack .b-front { left: 11px; z-index: 1; transform: translateY(-1px); }

.toggle-btn.on {
  background: var(--theme-on-bg);
  border-color: var(--theme-on-border);
  box-shadow: 0 0 14px var(--theme-on-glow);
}
.toggle-btn.on .bulb {
  filter: drop-shadow(0 0 4px var(--theme-bulb-tint));
}
.toggle-btn.on .b-back,
.toggle-btn.on .b-side { opacity: 0.85; }

.toggle-btn.mixed {
  border-color: var(--theme-mixed-ring);
  box-shadow: 0 0 10px var(--theme-mixed-ring);
}

.chip-text {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 2px;
  width: 100%;
  min-width: 0;
}

.chip-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  line-height: 1.2;
}

.chip-state {
  font-size: 0.6rem;
  color: #a0c4ff;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}
.chip-state.off { color: #475569; }

.chip-count {
  color: #64748b;
  font-weight: 500;
  margin-left: 2px;
}

.bri-slider {
  width: 100%;
  -webkit-appearance: none;
  height: 3px;
  border-radius: 2px;
  background: #2a2f45;
  outline: none;
  cursor: pointer;
  margin-top: 2px;
}
.bri-slider:disabled { opacity: 0.5; cursor: not-allowed; }
.bri-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #a0c4ff;
  cursor: pointer;
}
.bri-slider::-moz-range-thumb {
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #a0c4ff;
  cursor: pointer;
  border: 0;
}

.badge-row {
  display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;
}

.badge {
  font-size: 0.58rem;
  font-weight: 700;
  border-radius: 4px;
  padding: 1px 5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.badge.unreachable {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
}
.badge.partial {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.25);
}

.error-badge {
  position: absolute; top: 5px; left: 5px;
  background: #ef4444; color: #fff;
  width: 16px; height: 16px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: 700;
}

.tile-actions {
  position: absolute;
  top: 5px;
  right: 5px;
  display: flex;
  gap: 2px;
}
.tile-action-btn {
  background: none;
  border: none;
  color: #334155;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tile-action-btn:hover { color: #94a3b8; }
.tile-action-btn.ungroup:hover { color: #f87171; }
</style>
