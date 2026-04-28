<script setup lang="ts">
interface LightRow {
  id: number | null
  deviceId: string | null
  type: string
  label: string | null
  bridgeName?: string | null
  displayName?: string | null
  roomId: number | null
  roomName: string | null
  origin?: 'esp32' | 'hue'
  capabilities?: { brightness?: boolean; colorTemp?: boolean; color?: boolean }
  lightOn?: boolean | null
  lightBrightness?: number | null
  lightReachable?: boolean | null
}

const { data: sensors, refresh } = useFetch<LightRow[]>('/api/sensors', { default: () => [] })
const { data: blocked, refresh: refreshBlocked } = useFetch<{ deviceId: string; type: string }[]>(
  '/api/sensors/blocked',
  { default: () => [] }
)

onMounted(() => {
  const t = setInterval(() => { refresh(); refreshBlocked() }, 15_000)
  onUnmounted(() => clearInterval(t))
})

const onlyUnused = ref(false)
const search = ref('')

function matchesSearch(haystacks: (string | null | undefined)[], needle: string): boolean {
  if (!needle) return true
  const q = needle.toLowerCase()
  return haystacks.some(h => h?.toLowerCase().includes(q))
}

const lights = computed(() => sensors.value.filter(s => s.type === 'light'))
const visibleLights = computed(() => {
  let list = lights.value
  if (onlyUnused.value) list = list.filter(s => !s.roomName)
  return list.filter(s => matchesSearch([s.label, s.deviceId, s.roomName], search.value))
})
const visibleBlocked = computed(() => blocked.value
  .filter(b => b.type === 'light')
  .filter(b => matchesSearch([b.deviceId], search.value)))

const pendingDelete = ref<LightRow | null>(null)
const editingLight = ref<LightRow | null>(null)
const editingLabel = ref('')
const editingHue = ref<LightRow | null>(null)
const errorById = ref<Record<string, string>>({})
const pendingById = ref<Record<string, boolean>>({})

function isHueRow(row: LightRow): boolean {
  return row.origin === 'hue' || (row.deviceId?.startsWith('hue-') ?? false)
}

function canEdit(row: LightRow): boolean {
  return row.id !== null || isHueRow(row)
}

function briFromHue(b: number | null | undefined) {
  return Math.round(((b ?? 0) / 254) * 100)
}

function lightUrl(deviceId: string) {
  return `/api/integrations/hue/lights/${encodeURIComponent(deviceId)}/state`
}

async function toggle(row: LightRow) {
  if (!row.deviceId) return
  const next = !row.lightOn
  pendingById.value[row.deviceId] = true
  errorById.value[row.deviceId] = ''
  try {
    await $fetch(lightUrl(row.deviceId), { method: 'POST', body: { on: next } })
    await refresh()
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    errorById.value[row.deviceId] = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed')
  } finally {
    pendingById.value[row.deviceId] = false
  }
}

async function setBrightness(row: LightRow, percent: number) {
  if (!row.deviceId) return
  pendingById.value[row.deviceId] = true
  errorById.value[row.deviceId] = ''
  try {
    const body: { brightness: number; on?: boolean } = { brightness: percent }
    if (percent > 0 && !row.lightOn) body.on = true
    await $fetch(lightUrl(row.deviceId), { method: 'POST', body })
    await refresh()
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    errorById.value[row.deviceId] = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed')
  } finally {
    pendingById.value[row.deviceId] = false
  }
}

function openEdit(row: LightRow) {
  if (isHueRow(row)) {
    editingHue.value = row
    return
  }
  if (row.id === null) return
  editingLight.value = row
  editingLabel.value = row.label ?? ''
}

async function saveEdit() {
  const row = editingLight.value
  if (!row?.id) return
  await $fetch(`/api/sensors/${row.id}`, { method: 'PATCH', body: { label: editingLabel.value.trim() || null } })
  editingLight.value = null
  await refresh()
}

async function onHueRenamed() {
  editingHue.value = null
  await refresh()
}

async function confirmDelete() {
  const row = pendingDelete.value
  if (!row) return
  if (row.id !== null) {
    await $fetch(`/api/sensors/${row.id}`, { method: 'DELETE' })
  } else if (row.deviceId) {
    await $fetch('/api/sensors/block', { method: 'DELETE', body: { deviceId: row.deviceId, type: row.type } })
  }
  pendingDelete.value = null
  await Promise.all([refresh(), refreshBlocked()])
}

async function restoreBlocked(b: { deviceId: string; type: string }) {
  await $fetch('/api/sensors/unblock', { method: 'POST', body: b })
  await Promise.all([refresh(), refreshBlocked()])
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <input
        v-model="search"
        type="search"
        class="search-input"
        placeholder="Search lights…"
      />
      <label class="toggle-label">
        <input v-model="onlyUnused" type="checkbox" class="toggle-input" />
        <span class="toggle-track"><span class="toggle-thumb" /></span>
        Only show unused
      </label>
    </header>

    <div v-if="visibleLights.length === 0" class="empty">
      {{ onlyUnused ? 'No unused lights.' : 'No lights registered. Connect a Hue Bridge from Integrations.' }}
    </div>

    <div v-else class="light-list">
      <div
        v-for="(row, i) in visibleLights"
        :key="row.id ?? `${row.deviceId}:${row.type}:${i}`"
        class="light-row"
        :class="{ 'light-offline': row.lightReachable === false, 'light-on': row.lightOn }"
      >
        <span class="light-icon">💡</span>

        <div class="light-info">
          <span class="light-name">
            {{ row.label || 'Light' }}
            <span v-if="row.origin === 'hue'" class="hue-badge" title="Philips Hue">Hue</span>
          </span>
          <span class="light-room" :class="{ unassigned: !row.roomName }">
            {{ row.roomName ?? 'Unassigned' }}
          </span>
          <span v-if="row.deviceId" class="device-id">{{ row.deviceId }}</span>
        </div>

        <div class="light-controls" @click.stop>
          <div class="controls-top">
            <div v-if="row.capabilities?.brightness" class="brightness">
              <input
                type="range" min="0" max="100" step="1"
                :value="briFromHue(row.lightBrightness)"
                :disabled="!row.deviceId || pendingById[row.deviceId ?? ''] || row.lightReachable === false"
                class="bri-slider"
                @change="(e) => setBrightness(row, Number((e.target as HTMLInputElement).value))"
              />
              <span class="bri-value">{{ briFromHue(row.lightBrightness) }}%</span>
            </div>
            <button
              class="toggle-btn"
              :class="{ on: row.lightOn }"
              :disabled="!row.deviceId || pendingById[row.deviceId] || row.lightReachable === false"
              :title="row.lightOn ? 'Turn off' : 'Turn on'"
              @click="toggle(row)"
            >
              <span class="dot" />
            </button>
          </div>
          <div v-if="row.lightReachable === false || (row.deviceId && errorById[row.deviceId])" class="controls-bottom">
            <span v-if="row.lightReachable === false" class="offline-badge">Unreachable</span>
            <span v-if="row.deviceId && errorById[row.deviceId]" class="error-msg" :title="errorById[row.deviceId]">!</span>
          </div>
        </div>

        <div class="row-actions">
          <button v-if="canEdit(row)" class="action-btn" :title="isHueRow(row) ? 'Rename Hue light' : 'Edit light'" @click="openEdit(row)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
          </button>
          <button class="action-btn delete" title="Remove light" @click="pendingDelete = row">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <section v-if="visibleBlocked.length" class="blocked-section">
      <h2 class="blocked-title">Hidden lights ({{ visibleBlocked.length }})</h2>
      <div class="blocked-list">
        <div v-for="b in visibleBlocked" :key="`${b.deviceId}:${b.type}`" class="blocked-row">
          <span class="light-icon">💡</span>
          <div class="light-info">
            <span class="light-name">Light</span>
            <span class="device-id">{{ b.deviceId }}</span>
          </div>
          <button class="btn-restore" @click="restoreBlocked(b)">Restore</button>
        </div>
      </div>
    </section>
  </div>

  <ConfirmDialog
    v-if="pendingDelete"
    :message="pendingDelete.id === null
      ? `Hide light &quot;${pendingDelete.label || 'Light'}&quot;? You can restore it from the Hidden lights section below.`
      : `Remove light &quot;${pendingDelete.label || 'Light'}&quot; from its room?`"
    :confirm-label="pendingDelete.id === null ? 'Hide' : 'Remove'"
    @confirm="confirmDelete"
    @cancel="pendingDelete = null"
  />

  <Teleport to="body">
    <div v-if="editingLight" class="modal-overlay" @click.self="editingLight = null">
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-icon">💡</span>
          <div>
            <div class="modal-title">Light</div>
            <div v-if="editingLight.deviceId" class="modal-device-id">{{ editingLight.deviceId }}</div>
          </div>
        </div>

        <label class="modal-field">
          <span>Label</span>
          <input
            v-model="editingLabel"
            class="modal-input"
            placeholder="Custom label…"
            maxlength="60"
            autofocus
            @keydown.enter="saveEdit"
            @keydown.escape="editingLight = null"
          />
        </label>

        <div class="modal-actions">
          <button class="btn-cancel" @click="editingLight = null">Cancel</button>
          <button class="btn-save" @click="saveEdit">Save</button>
        </div>
      </div>
    </div>
  </Teleport>

  <HueRenameModal
    v-if="editingHue?.deviceId"
    :device-id="editingHue.deviceId"
    :bridge-name="editingHue.bridgeName ?? null"
    :current-name="editingHue.displayName ?? null"
    @saved="onHueRenamed"
    @close="editingHue = null"
  />
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 24px; }

.page-header { display: flex; align-items: center; justify-content: flex-end; gap: 14px; flex-wrap: wrap; }

.search-input {
  flex: 1;
  min-width: 200px;
  max-width: 360px;
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 8px;
  padding: 8px 12px;
  color: #e2e8f0;
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.15s;
}
.search-input::placeholder { color: #475569; }
.search-input:focus { border-color: #4a6fa5; }

.toggle-label {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.8rem; color: #64748b;
  cursor: pointer; user-select: none; padding-bottom: 4px;
}
.toggle-input { display: none; }
.toggle-track {
  width: 32px; height: 18px; background: #2a2f45; border-radius: 9px;
  position: relative; transition: background 0.2s; flex-shrink: 0;
}
.toggle-input:checked + .toggle-track { background: #4a6fa5; }
.toggle-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%;
  background: #475569; transition: left 0.2s, background 0.2s;
}
.toggle-input:checked + .toggle-track .toggle-thumb { left: 16px; background: #fff; }

.empty { color: #475569; font-size: 0.95rem; padding: 60px 0; text-align: center; }

.light-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 8px;
}

.light-row {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 10px;
  padding: 18px 18px;
  height: 104px;
  transition: border-color 0.15s;
}
.light-row:hover { border-color: #4a6fa5; }
.light-row.light-on { background: linear-gradient(180deg, #1d2238 0%, #1e2130 60%); }
.light-row.light-offline { border-color: rgba(248, 113, 113, 0.4); background: rgba(248, 113, 113, 0.04); }

.light-icon { font-size: 1.2rem; flex-shrink: 0; }

.light-info {
  display: flex; flex-direction: column; gap: 2px;
  flex: 1; min-width: 0; overflow: hidden;
}
.light-name {
  font-size: 0.9rem; font-weight: 600; color: #e2e8f0;
  display: inline-flex; align-items: center; gap: 6px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 100%;
}
.hue-badge {
  background: rgba(251, 146, 60, 0.18); color: #fdba74;
  font-size: 0.6rem; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  padding: 1px 6px; border-radius: 999px;
}
.light-room { font-size: 0.75rem; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.light-room.unassigned { color: #475569; font-style: italic; }
.device-id {
  font-size: 0.68rem; color: #475569; font-family: monospace;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;
}

.light-controls {
  display: flex; flex-direction: column;
  align-items: flex-end; gap: 4px;
  flex-shrink: 0;
}

.controls-top { display: flex; align-items: center; gap: 8px; }

.toggle-btn {
  width: 38px; height: 22px; padding: 0;
  border-radius: 11px; border: 1px solid #2a2f45;
  background: #2a2f45; cursor: pointer; position: relative;
  transition: background 0.15s, border-color 0.15s;
}
.toggle-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.toggle-btn .dot {
  position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #64748b; transition: transform 0.18s, background 0.15s;
}
.toggle-btn.on { background: #4a6fa5; border-color: #4a6fa5; }
.toggle-btn.on .dot { transform: translateX(16px); background: #f1f5f9; }

.brightness { display: flex; align-items: center; gap: 6px; }
.bri-slider {
  width: 110px;
  -webkit-appearance: none;
  height: 3px; border-radius: 2px;
  background: #2a2f45; outline: none; cursor: pointer;
}
.bri-slider:disabled { opacity: 0.5; cursor: not-allowed; }
.bri-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 13px; height: 13px; border-radius: 50%;
  background: #a0c4ff; cursor: pointer;
}
.bri-slider::-moz-range-thumb {
  width: 13px; height: 13px; border-radius: 50%;
  background: #a0c4ff; cursor: pointer; border: 0;
}
.bri-value { font-size: 0.7rem; color: #64748b; min-width: 32px; font-variant-numeric: tabular-nums; }

.offline-badge {
  font-size: 0.6rem; font-weight: 700; color: #f87171;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
  border-radius: 4px; padding: 1px 5px;
  letter-spacing: 0.04em; text-transform: uppercase;
}

.error-msg {
  background: #ef4444; color: #fff;
  width: 18px; height: 18px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem; font-weight: 700;
}

.row-actions { display: flex; gap: 4px; flex-shrink: 0; }

.action-btn {
  background: none; border: 1px solid transparent;
  color: #334155; border-radius: 7px;
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: color 0.15s, border-color 0.15s;
}
.light-row:hover .action-btn { color: #475569; border-color: #2a2f45; }
.action-btn:hover { color: #94a3b8 !important; border-color: #4a6fa5 !important; }
.action-btn.delete:hover { color: #f87171 !important; border-color: #ef4444 !important; }

.blocked-section { margin-top: 28px; display: flex; flex-direction: column; gap: 8px; }
.blocked-title {
  font-size: 0.78rem; font-weight: 600; color: #64748b;
  letter-spacing: 0.04em; text-transform: uppercase; margin: 0 0 4px;
}
.blocked-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 8px; }
.blocked-row {
  display: flex; align-items: center; gap: 14px;
  background: #161924; border: 1px dashed #2a2f45;
  border-radius: 10px; padding: 10px 14px;
}
.blocked-row .light-name { color: #94a3b8; }

.btn-restore {
  background: none; border: 1px solid #2a2f45; color: #64748b;
  border-radius: 7px; padding: 5px 12px; font-size: 0.78rem;
  cursor: pointer; transition: color 0.15s, border-color 0.15s;
}
.btn-restore:hover { color: #a0c4ff; border-color: #4a6fa5; }

.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 200; padding: 24px;
}
.modal-card {
  background: #1e2130; border: 1px solid #2a2f45; border-radius: 12px;
  padding: 24px; width: 100%; max-width: 360px;
  display: flex; flex-direction: column; gap: 18px;
}
.modal-header { display: flex; align-items: center; gap: 12px; }
.modal-icon { font-size: 1.6rem; }
.modal-title { font-size: 1rem; font-weight: 700; color: #e2e8f0; }
.modal-device-id { font-size: 0.7rem; color: #475569; font-family: monospace; margin-top: 2px; }
.modal-field { display: flex; flex-direction: column; gap: 6px; font-size: 0.8rem; color: #94a3b8; }
.modal-input {
  background: #0f1117; border: 1px solid #2a2f45;
  border-radius: 8px; padding: 9px 12px;
  color: #e2e8f0; font-size: 0.9rem; outline: none;
  transition: border-color 0.15s;
}
.modal-input:focus { border-color: #4a6fa5; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.btn-cancel {
  background: none; color: #64748b; border: 1px solid #2a2f45;
  border-radius: 8px; padding: 7px 16px; font-size: 0.85rem;
  cursor: pointer; transition: color 0.15s;
}
.btn-cancel:hover { color: #94a3b8; }
.btn-save {
  background: #4a6fa5; color: #fff; border: none;
  border-radius: 8px; padding: 7px 16px; font-size: 0.85rem; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.btn-save:hover { background: #6b93c7; }
</style>
