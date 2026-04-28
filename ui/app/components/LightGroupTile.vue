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

async function commitBrightness() {
  dragging.value = false
  if (localBri.value === null) return
  pending.value = true
  error.value = null
  partial.value = null
  try {
    const body: { brightness: number; on?: boolean } = { brightness: localBri.value }
    if (localBri.value > 0 && displayState.value !== 'all-on') {
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
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div
    class="sensor-tile group-tile"
    :class="{ 'is-on': isOn, 'is-mixed': displayState === 'mixed' }"
  >
    <span class="tile-icon">💡✨</span>
    <span class="tile-name" :title="group.name">{{ group.name }}</span>
    <span class="tile-state" :class="{ off: displayState === 'all-off' }">{{ stateLabel }}</span>
    <span class="tile-meta">{{ group.memberCount }} {{ group.memberCount === 1 ? 'light' : 'lights' }}</span>

    <button
      class="toggle-btn"
      :class="{ on: isOn }"
      :disabled="pending || group.memberCount === 0"
      :title="isOn ? 'Turn group off' : 'Turn group on'"
      @click.stop="toggleMaster"
    >
      <span class="dot" />
    </button>

    <div v-if="group.hasBrightnessCapableMember" class="brightness-row" @click.stop>
      <input
        :value="displayBri"
        type="range" min="0" max="100" step="1"
        class="bri-slider"
        :disabled="pending || group.memberCount === 0"
        @input="(e) => { dragging = true; localBri = Number((e.target as HTMLInputElement).value) }"
        @change="commitBrightness"
      />
      <span class="bri-value">{{ displayBri }}%</span>
    </div>

    <div class="badge-row">
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
  border-radius: 10px;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 5px;
  position: relative;
  min-height: 160px;
  text-align: center;
  grid-column: span 2;
  border: 1px solid #2a2f45;
}

.group-tile.is-on {
  background: linear-gradient(180deg, #1d2238 0%, #151825 100%);
  border-color: #4a6fa5;
}
.group-tile.is-mixed {
  border-color: rgba(168, 85, 247, 0.45);
}

.tile-icon { font-size: 1.2rem; }

.tile-name {
  font-size: 0.92rem;
  font-weight: 700;
  color: #e2e8f0;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.tile-state {
  font-size: 0.78rem;
  font-weight: 600;
  color: #a0c4ff;
}
.tile-state.off { color: #475569; }

.tile-meta {
  font-size: 0.65rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.toggle-btn {
  margin-top: 4px;
  width: 44px; height: 24px; padding: 0;
  border-radius: 12px;
  border: 1px solid #2a2f45;
  background: #2a2f45;
  cursor: pointer; position: relative;
  transition: background 0.15s, border-color 0.15s;
}
.toggle-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.toggle-btn .dot {
  position: absolute; top: 2px; left: 2px;
  width: 18px; height: 18px; border-radius: 50%;
  background: #64748b;
  transition: transform 0.18s, background 0.15s;
}
.toggle-btn.on { background: #4a6fa5; border-color: #4a6fa5; }
.toggle-btn.on .dot { transform: translateX(20px); background: #f1f5f9; }

.brightness-row {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 0 6px; margin-top: 4px;
}
.bri-slider {
  flex: 1;
  -webkit-appearance: none;
  height: 3px; border-radius: 2px;
  background: #2a2f45; outline: none; cursor: pointer;
}
.bri-slider:disabled { opacity: 0.5; cursor: not-allowed; }
.bri-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 13px; height: 13px;
  border-radius: 50%;
  background: #a0c4ff;
  cursor: pointer;
}
.bri-slider::-moz-range-thumb {
  width: 13px; height: 13px;
  border-radius: 50%;
  background: #a0c4ff;
  cursor: pointer; border: 0;
}
.bri-value {
  font-size: 0.66rem; color: #64748b; font-variant-numeric: tabular-nums;
  min-width: 30px;
}

.badge-row {
  display: flex; gap: 4px; flex-wrap: wrap; justify-content: center;
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
  position: absolute; top: 5px; right: 5px;
  display: flex; gap: 2px;
}
.tile-action-btn {
  background: none; border: none; color: #334155;
  cursor: pointer; font-size: 1rem; line-height: 1;
  padding: 2px 4px; border-radius: 4px;
  transition: color 0.15s;
  display: flex; align-items: center; justify-content: center;
}
.tile-action-btn:hover { color: #94a3b8; }
.tile-action-btn.ungroup:hover { color: #f87171; }
</style>
