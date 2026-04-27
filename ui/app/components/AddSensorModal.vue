<script setup lang="ts">
import type { SensorType, DiscoveredSensor } from '../../shared/types'

defineProps<{ roomName: string }>()

const emit = defineEmits<{
  (e: 'add', payload: { type: SensorType; sensorId?: number; deviceId?: string; label: string; streamUrl: string; snapshotUrl: string }): void
  (e: 'close'): void
}>()

const discovered = ref<DiscoveredSensor[]>([])
const pending = ref(true)

onMounted(async () => {
  try {
    discovered.value = await $fetch<DiscoveredSensor[]>('/api/sensors/discovered')
  } finally {
    pending.value = false
  }
})

const manual = ref(false)
const selected = ref<DiscoveredSensor | null>(null)
const manualType = ref<SensorType>('camera')
const label = ref('')
const streamUrl = ref('')
const snapshotUrl = ref('')
const search = ref('')
const activeFilter = ref<string>('all')

const manualTypes: { value: SensorType; icon: string; label: string }[] = [
  { value: 'camera', icon: '📷', label: 'Camera' },
  { value: 'motion', icon: '🏃', label: 'Motion' },
]

function isSameDevice(a: DiscoveredSensor, b: DiscoveredSensor) {
  if (a.sensorId && b.sensorId) return a.sensorId === b.sensorId
  return a.deviceId === b.deviceId && a.sensorType === b.sensorType
}

function selectDevice(d: DiscoveredSensor) {
  selected.value = selected.value && isSameDevice(selected.value, d) ? null : d
  if (selected.value && !label.value) label.value = ''
}

function submit() {
  if (manual.value) {
    emit('add', {
      type: manualType.value,
      label: label.value.trim(),
      streamUrl: streamUrl.value.trim(),
      snapshotUrl: snapshotUrl.value.trim(),
    })
  } else if (selected.value) {
    emit('add', {
      type: selected.value.sensorType as SensorType,
      sensorId: selected.value.sensorId,
      deviceId: selected.value.deviceId ?? undefined,
      label: label.value.trim(),
      streamUrl: '',
      snapshotUrl: '',
    })
  }
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

function sensorIcon(type: string): string {
  const icons: Record<string, string> = {
    temperature: '🌡️', humidity: '💧', camera: '📷', motion: '🏃',
    light: '💡', lightlevel: '☀️',
  }
  return icons[type] ?? '📡'
}

function typeLabelText(type: string): string {
  const labels: Record<string, string> = {
    temperature: 'Temperature', humidity: 'Humidity', camera: 'Camera', motion: 'Motion',
    light: 'Light', lightlevel: 'Light level',
  }
  return labels[type] ?? type
}

function sensorMeta(d: DiscoveredSensor): string {
  const age = d.sensorId ? 'unassigned' : timeAgo(d.lastSeen)
  if (d.sensorType === 'camera') return age
  if (d.sensorType === 'light') return age
  if (d.latestValue == null) return age
  return `${d.latestValue.toFixed(1)} · ${age}`
}

const canSubmit = computed(() => manual.value ? true : selected.value !== null)

interface Group { type: string; label: string; icon: string; items: DiscoveredSensor[] }

const groupOrder: { type: string; label: string; icon: string }[] = [
  { type: 'light',       label: 'Lights',          icon: '💡' },
  { type: 'camera',      label: 'Cameras',         icon: '📷' },
  { type: 'temperature', label: 'Temperature',     icon: '🌡️' },
  { type: 'humidity',    label: 'Humidity',        icon: '💧' },
  { type: 'motion',      label: 'Motion',          icon: '🏃' },
  { type: 'lightlevel',  label: 'Light level',     icon: '☀️' },
]

const filteredDiscovered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return discovered.value.filter(d => {
    if (q) {
      const hay = [d.label, d.deviceId, d.sensorType, typeLabelText(d.sensorType)]
      if (!hay.some(h => h?.toLowerCase().includes(q))) return false
    }
    return true
  })
})

const groupedDiscovered = computed<Group[]>(() => {
  const known = new Set(groupOrder.map(g => g.type))
  const groups: Group[] = groupOrder.map(g => ({ ...g, items: [] }))
  const otherItems: DiscoveredSensor[] = []
  for (const d of filteredDiscovered.value) {
    if (known.has(d.sensorType)) {
      const group = groups.find(g => g.type === d.sensorType)
      if (group) group.items.push(d)
    } else {
      otherItems.push(d)
    }
  }
  if (otherItems.length) {
    groups.push({ type: 'other', label: 'Other', icon: '📡', items: otherItems })
  }
  return groups.filter(g => g.items.length > 0)
})

const visibleGroups = computed<Group[]>(() => {
  if (activeFilter.value === 'all') return groupedDiscovered.value
  return groupedDiscovered.value.filter(g => g.type === activeFilter.value)
})

const totalCount = computed(() => filteredDiscovered.value.length)

const submitLabel = computed(() => {
  if (manual.value) {
    return `Add ${typeLabelText(manualType.value).toLowerCase()}`
  }
  if (selected.value) {
    return `Add ${typeLabelText(selected.value.sensorType).toLowerCase()}`
  }
  return 'Add to room'
})
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click="onBackdropClick">
      <div class="modal">
        <header class="modal-header">
          <div>
            <h2 class="title">Add device</h2>
            <p class="subtitle">to <strong>{{ roomName }}</strong></p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="emit('close')">×</button>
        </header>

        <form class="form" @submit.prevent="submit">
          <!-- Discovered devices -->
          <template v-if="!manual">
            <div class="toolbar">
              <input
                v-model="search"
                type="text"
                class="search-input"
                placeholder="Search by name, device ID, type…"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                role="searchbox"
              />
            </div>

            <div v-if="!pending && groupedDiscovered.length > 1" class="filter-tabs">
              <button
                type="button"
                class="filter-tab"
                :class="{ active: activeFilter === 'all' }"
                @click="activeFilter = 'all'"
              >
                All <span class="filter-count">{{ totalCount }}</span>
              </button>
              <button
                v-for="group in groupedDiscovered"
                :key="group.type"
                type="button"
                class="filter-tab"
                :class="{ active: activeFilter === group.type }"
                @click="activeFilter = group.type"
              >
                <span class="filter-icon">{{ group.icon }}</span>
                {{ group.label }}
                <span class="filter-count">{{ group.items.length }}</span>
              </button>
            </div>

            <div class="device-scroll">
              <div v-if="pending" class="empty-state">Loading…</div>

              <template v-else-if="visibleGroups.length">
                <section v-for="group in visibleGroups" :key="group.type" class="group">
                  <h3 class="group-heading">
                    <span class="group-icon">{{ group.icon }}</span>
                    <span>{{ group.label }}</span>
                    <span class="group-count">{{ group.items.length }}</span>
                  </h3>
                  <div class="device-list">
                    <button
                      v-for="d in group.items"
                      :key="d.sensorId ? `sensor:${d.sensorId}` : `${d.deviceId}:${d.sensorType}`"
                      type="button"
                      class="device-row"
                      :class="{ selected: !!selected && isSameDevice(selected, d) }"
                      @click="selectDevice(d)"
                    >
                      <span class="device-icon">{{ sensorIcon(d.sensorType) }}</span>
                      <span class="device-info">
                        <span class="device-name">
                          {{ d.label || d.deviceId || typeLabelText(d.sensorType) }}
                          <span v-if="d.origin === 'hue'" class="hue-badge" title="Philips Hue">Hue</span>
                        </span>
                        <span class="device-meta">{{ sensorMeta(d) }}</span>
                      </span>
                      <span class="device-check" aria-hidden="true">
                        <svg v-if="selected && isSameDevice(selected, d)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </span>
                    </button>
                  </div>
                </section>
              </template>

              <div v-else-if="search" class="empty-state">
                No devices match <strong>"{{ search }}"</strong>.
              </div>

              <div v-else class="empty-state">
                <p class="empty-title">Nothing to discover yet</p>
                <p class="hint">Make sure your devices are powered on. ESP32 sensors publish over MQTT; Hue lights and sensors appear after pairing the bridge.</p>
              </div>
            </div>

            <div v-if="selected" class="field">
              <label class="field-label">Custom label <span class="optional">(optional)</span></label>
              <input v-model="label" class="input" :placeholder="selected.label || selected.deviceId || 'Friendly name'" maxlength="60" />
            </div>
          </template>

          <!-- Manual entry (camera / motion) -->
          <template v-else>
            <div class="field">
              <label class="field-label">Type</label>
              <div class="type-grid">
                <button
                  v-for="opt in manualTypes"
                  :key="opt.value"
                  type="button"
                  class="type-btn"
                  :class="{ selected: manualType === opt.value }"
                  @click="manualType = opt.value"
                >
                  <span class="type-icon">{{ opt.icon }}</span>
                  <span>{{ opt.label }}</span>
                </button>
              </div>
            </div>

            <div class="field">
              <label class="field-label">Label <span class="optional">(optional)</span></label>
              <input v-model="label" class="input" placeholder="e.g. Front door, Living room…" maxlength="60" />
            </div>

            <template v-if="manualType === 'camera'">
              <div class="field">
                <label class="field-label">Stream URL <span class="optional">(MJPEG / HLS)</span></label>
                <input v-model="streamUrl" class="input" placeholder="http://…" />
              </div>
              <div class="field">
                <label class="field-label">Snapshot URL <span class="optional">(optional)</span></label>
                <input v-model="snapshotUrl" class="input" placeholder="http://…" />
              </div>
            </template>
          </template>

          <footer class="modal-footer">
            <button type="button" class="btn-toggle" @click="manual = !manual; selected = null">
              {{ manual ? '← Back to discovered devices' : 'Add a camera or motion sensor manually' }}
            </button>
            <div class="actions">
              <button type="button" class="btn-cancel" @click="emit('close')">Cancel</button>
              <button type="submit" class="btn-add" :disabled="!canSubmit">{{ submitLabel }}</button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 100; padding: 24px;
}

.modal {
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 18px;
  width: 100%;
  max-width: 620px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}

/* ── Header ──────────────────────────────────────────────── */
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 32px 40px 28px;
}

.title { margin: 0; font-size: 1.15rem; font-weight: 600; color: #e2e8f0; letter-spacing: -0.01em; }
.subtitle { margin: 6px 0 0; font-size: 0.85rem; color: #64748b; }
.subtitle strong { color: #94a3b8; font-weight: 600; }

.close {
  background: none; border: none; color: #475569;
  font-size: 1.6rem; line-height: 1;
  cursor: pointer; padding: 0;
  width: 32px; height: 32px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  transition: color 0.12s, background 0.12s;
}
.close:hover { color: #e2e8f0; background: rgba(255, 255, 255, 0.04); }

/* ── Form layout ────────────────────────────────────────── */
.form {
  display: flex; flex-direction: column;
  flex: 1; min-height: 0;
}

.toolbar { padding: 0 40px 22px; }

.search-input {
  width: 100%;
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 10px;
  padding: 11px 14px;
  font-size: 0.9rem;
  color: #e2e8f0;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.search-input::placeholder { color: #475569; }
.search-input:focus {
  border-color: #4a6fa5;
  box-shadow: 0 0 0 2px rgba(74, 111, 165, 0.18);
}

.filter-tabs {
  display: flex; gap: 8px; align-items: center;
  padding: 28px 40px 20px;
  margin-top: 4px;
  border-top: 1px solid #2a2f45;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.filter-tabs::-webkit-scrollbar { display: none; }

.filter-tab {
  display: inline-flex; align-items: center; gap: 7px;
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 999px;
  padding: 7px 14px;
  min-height: 32px;
  line-height: 1.2;
  font-size: 0.78rem;
  color: #94a3b8;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}
.filter-tab:hover { color: #e2e8f0; border-color: #4a6fa5; }
.filter-tab.active {
  background: rgba(74, 111, 165, 0.15);
  border-color: #4a6fa5;
  color: #a0c4ff;
}
.filter-icon { font-size: 0.9rem; line-height: 1; }
.filter-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  border-radius: 999px;
  padding: 2px 8px;
  min-width: 22px;
  min-height: 18px;
  line-height: 1;
  color: inherit;
}

/* ── Scrollable device area ─────────────────────────────── */
.device-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px 40px 16px;
  display: flex; flex-direction: column; gap: 28px;
  min-height: 160px;
  scrollbar-width: thin;
  scrollbar-color: #2a2f45 transparent;
}
.device-scroll::-webkit-scrollbar { width: 8px; }
.device-scroll::-webkit-scrollbar-track { background: transparent; }
.device-scroll::-webkit-scrollbar-thumb {
  background: #2a2f45;
  border-radius: 4px;
  border: 2px solid #1e2130;
}
.device-scroll::-webkit-scrollbar-thumb:hover { background: #3b4263; }

.group { display: flex; flex-direction: column; gap: 12px; }

.group-heading {
  display: flex; align-items: center; gap: 10px;
  margin: 0;
  padding: 0 4px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}
.group-icon { font-size: 0.95rem; }
.group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 999px;
  padding: 2px 8px;
  min-width: 22px;
  min-height: 18px;
  line-height: 1;
  font-size: 0.68rem;
  color: #94a3b8;
  letter-spacing: 0;
  font-weight: 500;
}

.device-list { display: flex; flex-direction: column; gap: 10px; }

.device-row {
  display: flex; align-items: center; gap: 16px;
  padding: 16px 18px;
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s, transform 0.08s;
  color: inherit;
  font: inherit;
}
.device-row:hover { border-color: #3b4263; background: #181b29; }
.device-row:active { transform: scale(0.998); }
.device-row.selected {
  border-color: #4a6fa5;
  background: linear-gradient(180deg, #1a2540 0%, #16202f 100%);
}

.device-icon {
  font-size: 1.4rem; flex-shrink: 0;
  width: 42px; height: 42px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
}
.device-info { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }
.device-name {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.92rem; color: #e2e8f0; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 100%;
}

.hue-badge {
  background: rgba(251, 146, 60, 0.18);
  color: #fdba74;
  font-size: 0.6rem; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  padding: 1px 6px; border-radius: 999px;
  flex-shrink: 0;
}

.device-meta {
  font-size: 0.76rem; color: #64748b;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-transform: capitalize;
}

.device-check {
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 1.5px solid #2a2f45;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  color: #4a6fa5;
  transition: border-color 0.12s, background 0.12s, color 0.12s;
}
.device-row.selected .device-check {
  border-color: #4a6fa5;
  background: #4a6fa5;
  color: #fff;
}

/* ── Empty state ────────────────────────────────────────── */
.empty-state {
  font-size: 0.88rem;
  color: #64748b;
  padding: 40px 24px;
  text-align: center;
  background: #151825;
  border: 1px dashed #2a2f45;
  border-radius: 12px;
  line-height: 1.6;
}
.empty-title { font-weight: 600; color: #94a3b8; margin: 0 0 6px; font-size: 0.95rem; }
.empty-state strong { color: #94a3b8; }
.hint { font-size: 0.82rem; color: #475569; margin: 0; }

/* ── Form fields ────────────────────────────────────────── */
.field {
  display: flex; flex-direction: column; gap: 12px;
  padding: 22px 40px 0;
}
.field-label { font-size: 0.78rem; color: #94a3b8; font-weight: 500; }
.optional { color: #475569; font-weight: 400; }

.type-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.type-btn {
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 10px;
  padding: 12px 6px;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  cursor: pointer;
  color: #64748b;
  font-size: 0.8rem; font-weight: 500;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}
.type-btn:hover { border-color: #4a6fa5; color: #94a3b8; }
.type-btn.selected { border-color: #4a6fa5; background: #1a2540; color: #a0c4ff; }
.type-icon { font-size: 1.4rem; }

.input {
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 10px;
  padding: 11px 14px;
  color: #e2e8f0;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.input:focus {
  border-color: #4a6fa5;
  box-shadow: 0 0 0 3px rgba(74, 111, 165, 0.18);
}

/* ── Footer ─────────────────────────────────────────────── */
.modal-footer {
  display: flex; align-items: center; justify-content: space-between;
  gap: 20px;
  padding: 22px 40px;
  border-top: 1px solid #2a2f45;
  background: #1a1d2c;
  margin-top: 22px;
}

.btn-toggle {
  background: none; border: none;
  color: #93c5fd;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0;
  text-align: left;
  transition: color 0.12s;
}
.btn-toggle:hover { color: #c7dbff; text-decoration: underline; }

.actions { display: flex; gap: 8px; }

.btn-cancel, .btn-add {
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.btn-cancel { background: transparent; color: #64748b; border: 1px solid #2a2f45; }
.btn-cancel:hover { color: #94a3b8; border-color: #475569; }
.btn-add { background: #4a6fa5; color: #fff; }
.btn-add:hover:not(:disabled) { background: #5b80b8; }
.btn-add:disabled { opacity: 0.4; cursor: default; }

@media (max-width: 540px) {
  .modal-footer { flex-direction: column; align-items: stretch; }
  .actions { justify-content: flex-end; }
}
</style>
