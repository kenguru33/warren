<script setup lang="ts">
import type { MasterState } from '../../shared/types'

interface LightRow {
  id: number | null
  deviceId: string | null
  type: string
  label: string | null
  roomId: number | null
  roomName: string | null
  origin?: 'esp32' | 'hue'
  capabilities?: { brightness?: boolean; colorTemp?: boolean; color?: boolean }
  lightOn?: boolean | null
  lightBrightness?: number | null
  lightReachable?: boolean | null
  hueName?: string | null
  groupId?: number | null
  groupName?: string | null
}

const { data: sensors, refresh } = useFetch<LightRow[]>('/api/sensors', { default: () => [] })
const { data: blocked, refresh: refreshBlocked } = useFetch<{ deviceId: string; type: string }[]>(
  '/api/sensors/blocked',
  { default: () => [] }
)
const { data: globalMaster, refresh: refreshGlobalMaster } = useFetch<MasterState | null>(
  '/api/lights/master-state',
  { default: () => null }
)

onMounted(() => {
  const t = setInterval(() => { refresh(); refreshBlocked(); refreshGlobalMaster() }, 15_000)
  onUnmounted(() => clearInterval(t))
})

// Global master switch — always rendered above search/filter so search doesn't hide it.
const globalMasterPending = ref(false)
const globalMasterError = ref<string | null>(null)
const globalMasterPartial = ref<{ ok: number; failed: number } | null>(null)

async function toggleGlobalMaster(nextOn: boolean) {
  if (globalMasterPending.value) return
  globalMasterPending.value = true
  globalMasterError.value = null
  globalMasterPartial.value = null
  try {
    const res = await $fetch<{ successCount: number; failureCount: number; total: number }>(
      '/api/lights/master-state',
      { method: 'POST', body: { on: nextOn } },
    )
    if (res.failureCount > 0) {
      globalMasterPartial.value = { ok: res.successCount, failed: res.failureCount }
    }
    await Promise.all([refresh(), refreshGlobalMaster()])
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    globalMasterError.value = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed')
  } finally {
    globalMasterPending.value = false
  }
}

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
  return list.filter(s => matchesSearch([s.label, s.hueName, s.deviceId, s.roomName, s.groupName], search.value))
})
const visibleBlocked = computed(() => blocked.value
  .filter(b => b.type === 'light')
  .filter(b => matchesSearch([b.deviceId], search.value)))

const pendingDelete = ref<LightRow | null>(null)
const editingLight = ref<LightRow | null>(null)
const editingLabel = ref('')
const errorById = ref<Record<string, string>>({})
const pendingById = ref<Record<string, boolean>>({})

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
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-text">Lights</h1>
        <p class="mt-1 text-sm text-muted">Toggle and dim every light, or filter to ones not yet placed in a room.</p>
      </div>
      <input
        v-model="search"
        type="search"
        class="input w-full sm:w-72"
        placeholder="Search lights…"
      />
    </div>

    <MasterLightToggle
      v-if="globalMaster"
      variant="wide"
      :master="globalMaster"
      :pending="globalMasterPending"
      :error="globalMasterError"
      :partial="globalMasterPartial"
      label="All lights"
      @toggle="toggleGlobalMaster"
    />

    <div class="flex items-center gap-2.5 text-sm text-muted">
      <AppSwitch :model-value="onlyUnused" @update:model-value="(v) => (onlyUnused = v)" label="Show only unused" />
      <span>Show only unused</span>
    </div>

    <div v-if="visibleLights.length === 0" class="card p-12 text-center text-sm text-muted">
      {{ onlyUnused ? 'No unused lights.' : 'No lights registered. Connect a Hue Bridge from Integrations.' }}
    </div>

    <ul v-else role="list" class="card divide-y divide-default dark:divide-white/10 overflow-hidden">
      <li
        v-for="(row, i) in visibleLights"
        :key="row.id ?? `${row.deviceId}:${row.type}:${i}`"
        :class="[
          'group/row flex items-center gap-x-4 px-5 py-4 transition-colors',
          row.lightReachable === false ? 'bg-red-500/[0.04]' : 'hover:bg-default/50 dark:hover:bg-white/[0.02]',
        ]"
      >
        <!-- Leading icon -->
        <div :class="[
          'flex size-10 flex-none items-center justify-center rounded-lg text-lg ring-1 transition',
          row.lightOn && row.lightReachable !== false
            ? 'bg-accent/20 ring-accent/40 text-accent-strong'
            : 'bg-surface-2 ring-default text-subtle dark:bg-white/5 dark:ring-white/10',
        ]">
          💡
        </div>

        <!-- Middle: title + subtitle -->
        <div class="min-w-0 flex-auto">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-sm/6 font-semibold text-text truncate">{{ row.label?.trim() || row.hueName?.trim() || 'Light' }}</p>
            <span v-if="row.origin === 'hue'" class="badge badge-warning">Hue</span>
            <span v-if="row.lightReachable === false" class="badge badge-error">Unreachable</span>
            <span v-if="row.groupName" class="badge badge-accent">{{ row.groupName }}</span>
          </div>
          <div class="mt-0.5 flex items-center gap-1.5 text-xs/5 text-subtle truncate">
            <span :class="row.roomName ? '' : 'italic'">{{ row.roomName ?? 'Unassigned' }}</span>
            <span v-if="row.deviceId" aria-hidden="true">·</span>
            <span v-if="row.deviceId" class="font-mono">{{ row.deviceId }}</span>
          </div>
        </div>

        <!-- Trailing controls — fixed widths so columns align across rows -->
        <div class="flex shrink-0 items-center gap-4" @click.stop>
          <div class="hidden sm:flex items-center gap-2 w-44">
            <template v-if="row.capabilities?.brightness">
              <input
                type="range" min="0" max="100" step="1"
                :value="briFromHue(row.lightBrightness)"
                :disabled="!row.deviceId || pendingById[row.deviceId ?? ''] || row.lightReachable === false"
                class="slider slider-sm flex-1"
                @change="(e) => setBrightness(row, Number((e.target as HTMLInputElement).value))"
              />
              <span class="text-xs/5 text-subtle tabular-nums w-9 text-right">{{ briFromHue(row.lightBrightness) }}%</span>
            </template>
          </div>
          <AppSwitch
            :model-value="!!row.lightOn"
            :disabled="!row.deviceId || pendingById[row.deviceId ?? ''] || row.lightReachable === false"
            label="On/Off"
            @update:model-value="() => toggle(row)"
          />
          <div class="w-5 shrink-0">
            <span v-if="row.deviceId && errorById[row.deviceId]" class="badge badge-error" :title="errorById[row.deviceId]">!</span>
          </div>
        </div>

        <!-- Trailing actions — fixed width reservation so toggles stay aligned across rows. -->
        <div class="flex w-[72px] shrink-0 items-center justify-end gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100">
          <button v-if="row.id !== null" class="btn-icon !size-8" title="Edit" @click="openEdit(row)">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
          <button class="btn-icon !size-8 hover:!text-red-600 dark:hover:!text-red-400" title="Remove" @click="pendingDelete = row">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </li>
    </ul>

    <section v-if="visibleBlocked.length">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">Hidden lights ({{ visibleBlocked.length }})</h2>
      <ul role="list" class="rounded-2xl ring-1 ring-default/70 dark:ring-white/5 divide-y divide-default">
        <li v-for="b in visibleBlocked" :key="`${b.deviceId}:${b.type}`" class="flex items-center gap-4 px-5 py-3 first:rounded-t-2xl last:rounded-b-2xl bg-surface-2/60">
          <span class="text-base">💡</span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-muted">Light</div>
            <div class="text-xs text-subtle font-mono truncate">{{ b.deviceId }}</div>
          </div>
          <button class="btn-secondary btn-sm" @click="restoreBlocked(b)">Restore</button>
        </li>
      </ul>
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

  <AppDialog v-if="editingLight" :open="true" max-width-class="max-w-md" @close="editingLight = null">
    <div class="p-6 space-y-4">
      <div class="flex items-center gap-3">
        <span class="text-2xl">💡</span>
        <div>
          <h3 class="text-base font-semibold text-text">Light</h3>
          <div v-if="editingLight.deviceId" class="text-xs text-subtle font-mono mt-0.5">{{ editingLight.deviceId }}</div>
        </div>
      </div>
      <div>
        <label class="label">Label</label>
        <input
          v-model="editingLabel"
          class="input mt-2"
          placeholder="Custom label…"
          maxlength="60"
          autofocus
          @keydown.enter="saveEdit"
          @keydown.escape="editingLight = null"
        />
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button class="btn-secondary" @click="editingLight = null">Cancel</button>
        <button class="btn-primary" @click="saveEdit">Save</button>
      </div>
    </div>
  </AppDialog>
</template>
