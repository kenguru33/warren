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

// mixed → first tap is ON (per spec). all-on → OFF. all-off → ON.
const nextOn = computed(() => props.master.state !== 'all-on')
const isOn = computed(() => props.master.state === 'all-on' || props.master.state === 'mixed')

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
  <div
    class="master-toggle"
    :class="[
      `state-${master.state}`,
      variant ?? 'compact',
      { 'is-on': isOn, pending },
    ]"
  >
    <button
      class="toggle-btn"
      :class="{ on: isOn, mixed: master.state === 'mixed' }"
      :disabled="pending"
      :title="nextOn ? 'Turn all on' : 'Turn all off'"
      @click="onClick"
    >
      <span class="dot" />
    </button>

    <div class="info">
      <span v-if="label" class="label">{{ label }}</span>
      <span class="state">{{ stateLabel }}</span>
      <span class="count">{{ master.memberCount }} {{ master.memberCount === 1 ? 'light' : 'lights' }}</span>
    </div>

    <div class="badges">
      <span v-if="master.unreachableCount > 0" class="badge unreachable" :title="`${master.unreachableCount} unreachable`">
        {{ master.unreachableCount }} unreachable
      </span>
      <span v-if="partial" class="badge partial" :title="`${partial.failed} member(s) failed`">
        {{ partial.failed }} failed
      </span>
      <span v-if="error" class="badge error" :title="error">!</span>
    </div>
  </div>
</template>

<style scoped>
.master-toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 10px;
  background: #151825;
  border: 1px solid #2a2f45;
  transition: background 0.15s, border-color 0.15s;
}
.master-toggle.is-on {
  background: linear-gradient(180deg, #1d2238 0%, #151825 100%);
  border-color: #4a6fa5;
}
.master-toggle.state-mixed { border-color: rgba(168, 85, 247, 0.45); }
.master-toggle.pending { opacity: 0.7; }

.master-toggle.wide {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
}

.toggle-btn {
  width: 38px; height: 22px; padding: 0;
  border-radius: 11px;
  border: 1px solid #2a2f45;
  background: #2a2f45;
  cursor: pointer; position: relative;
  transition: background 0.15s, border-color 0.15s;
  flex-shrink: 0;
}
.toggle-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.toggle-btn .dot {
  position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #64748b;
  transition: transform 0.18s, background 0.15s;
}
.toggle-btn.on { background: #4a6fa5; border-color: #4a6fa5; }
.toggle-btn.on .dot { transform: translateX(16px); background: #f1f5f9; }
.toggle-btn.mixed { background: rgba(168, 85, 247, 0.4); border-color: rgba(168, 85, 247, 0.6); }
.toggle-btn.mixed .dot { transform: translateX(8px); background: #e9d5ff; }

.info {
  display: flex; flex-direction: column;
  line-height: 1.15; min-width: 0;
}
.label {
  font-size: 0.7rem;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.state {
  font-size: 0.82rem;
  font-weight: 600;
  color: #a0c4ff;
}
.master-toggle:not(.is-on) .state { color: #475569; }
.count {
  font-size: 0.65rem;
  color: #64748b;
}

.badges {
  display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto;
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
.badge.error {
  color: #fff;
  background: #ef4444;
  width: 18px; height: 18px;
  border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0;
}
</style>
