<script setup lang="ts">
const { data: sensors, refresh } = useFetch('/api/sensors', { default: () => [] })
const { data: blocked, refresh: refreshBlocked } = useFetch<{ deviceId: string; type: string }[]>(
  '/api/sensors/blocked',
  { default: () => [] }
)

const now = ref(Date.now())

onMounted(() => {
  const tickTimer = setInterval(() => { now.value = Date.now() }, 5000)
  const refreshTimer = setInterval(() => { refresh(); refreshBlocked() }, 30000)
  onUnmounted(() => { clearInterval(tickTimer); clearInterval(refreshTimer) })
})

const onlyUnused = ref(false)
const search = ref('')

function matchesSearch(haystacks: (string | null | undefined)[], needle: string): boolean {
  if (!needle) return true
  const q = needle.toLowerCase()
  return haystacks.some(h => h?.toLowerCase().includes(q))
}

const nonLightSensors = computed(() => sensors.value.filter(s => s.type !== 'light'))
const visibleSensors = computed(() => {
  let list = nonLightSensors.value
  if (onlyUnused.value) list = list.filter(s => !s.roomName)
  return list.filter(s => matchesSearch([s.label, s.deviceId, s.roomName, typeLabel[s.type], s.type], search.value))
})
const visibleBlocked = computed(() => blocked.value
  .filter(b => b.type !== 'light')
  .filter(b => matchesSearch([b.deviceId, typeLabel[b.type], b.type], search.value)))

const typeIcon: Record<string, string> = {
  temperature: '🌡️',
  humidity: '💧',
  camera: '📷',
  motion: '🏃',
  light: '💡',
  lightlevel: '☀️',
}

const typeLabel: Record<string, string> = {
  temperature: 'Temperature',
  humidity: 'Humidity',
  camera: 'Camera',
  motion: 'Motion',
  light: 'Light',
  lightlevel: 'Light Level',
}

function formatValue(sensor: { type: string; latestValue: number | null; lightOn?: boolean | null }) {
  if (sensor.type === 'light') return sensor.lightOn ? 'On' : 'Off'
  if (sensor.latestValue === null) return '—'
  if (sensor.type === 'temperature') return `${sensor.latestValue}°C`
  if (sensor.type === 'humidity') return `${sensor.latestValue}%`
  if (sensor.type === 'motion') return sensor.latestValue === 1 ? 'Detected' : 'Clear'
  if (sensor.type === 'lightlevel') return `${Math.round(sensor.latestValue)} lx`
  return '—'
}

function isOffline(ms: number | null): boolean {
  if (!ms) return true
  return now.value - ms > 30_000
}

function formatAge(ms: number | null) {
  if (!ms) return 'Never'
  const diff = Math.round((now.value - ms) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

type SensorRow = { id: number | null; deviceId: string | null; type: string; label: string | null }

const pendingDelete = ref<SensorRow | null>(null)
const configuringSensor = ref<SensorRow | null>(null)

async function confirmDelete() {
  const sensor = pendingDelete.value
  if (!sensor) return
  if (sensor.id !== null) {
    await $fetch(`/api/sensors/${sensor.id}`, { method: 'DELETE' })
  } else if (sensor.deviceId) {
    await $fetch('/api/sensors/block', { method: 'DELETE', body: { deviceId: sensor.deviceId, type: sensor.type } })
  }
  pendingDelete.value = null
  await Promise.all([refresh(), refreshBlocked()])
}

async function restoreBlocked(b: { deviceId: string; type: string }) {
  await $fetch('/api/sensors/unblock', { method: 'POST', body: b })
  await Promise.all([refresh(), refreshBlocked()])
}

const editingSensor = ref<SensorRow | null>(null)
const editingLabel = ref('')

function openEdit(sensor: SensorRow) {
  if (sensor.id === null) return
  editingSensor.value = sensor
  editingLabel.value = sensor.label ?? ''
}

async function saveEdit() {
  const sensor = editingSensor.value
  if (!sensor?.id) return
  await $fetch(`/api/sensors/${sensor.id}`, { method: 'PATCH', body: { label: editingLabel.value.trim() || null } })
  editingSensor.value = null
  await refresh()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-text">Sensors</h1>
        <p class="mt-1 text-sm text-muted">Manage every sensor connected to Warren.</p>
      </div>
      <div class="flex items-center gap-3">
        <input
          v-model="search"
          type="search"
          class="input min-w-[220px]"
          placeholder="Search sensors…"
        />
        <label class="inline-flex items-center gap-2.5 text-sm text-muted cursor-pointer select-none">
          <AppSwitch :model-value="onlyUnused" @update:model-value="(v) => (onlyUnused = v)" label="Show only unused" />
          <span>Unused only</span>
        </label>
      </div>
    </div>

    <div v-if="visibleSensors.length === 0" class="card p-12 text-center text-sm text-muted">
      {{ onlyUnused ? 'No unused sensors.' : 'No sensors registered yet.' }}
    </div>

    <ul v-else role="list" class="card divide-y divide-default dark:divide-white/10 overflow-hidden">
      <li
        v-for="(sensor, i) in visibleSensors"
        :key="sensor.id ?? `${sensor.deviceId}:${sensor.type}:${i}`"
        class="group/row flex items-center gap-x-4 px-5 py-4 transition-colors hover:bg-default/50 dark:hover:bg-white/[0.02]"
      >
        <!-- Leading icon -->
        <div class="flex size-10 flex-none items-center justify-center rounded-lg bg-surface-2 text-lg dark:bg-white/5">
          {{ typeIcon[sensor.type] ?? '?' }}
        </div>

        <!-- Middle: title + subtitle -->
        <div class="min-w-0 flex-auto">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-sm/6 font-semibold text-text truncate">{{ sensor.label || typeLabel[sensor.type] || sensor.type }}</p>
            <span v-if="sensor.type !== 'camera' && isOffline(sensor.lastRecordedAt)" class="badge badge-error">Offline</span>
            <span v-if="!sensor.roomName" class="badge badge-neutral">Unassigned</span>
          </div>
          <div class="mt-0.5 flex items-center gap-1.5 text-xs/5 text-subtle truncate">
            <span v-if="sensor.label">{{ typeLabel[sensor.type] || sensor.type }}</span>
            <span v-if="sensor.label && sensor.roomName" aria-hidden="true">·</span>
            <span v-if="sensor.roomName">{{ sensor.roomName }}</span>
            <span v-if="sensor.deviceId" aria-hidden="true">·</span>
            <span v-if="sensor.deviceId" class="font-mono">{{ sensor.deviceId }}</span>
          </div>
        </div>

        <!-- Trailing value column — fixed width so adjacent rows align -->
        <div class="hidden shrink-0 sm:flex flex-col items-end w-24 text-right">
          <span :class="['text-sm/6 font-semibold tabular-nums', sensor.type !== 'camera' && isOffline(sensor.lastRecordedAt) ? 'text-subtle' : 'text-text']">{{ formatValue(sensor) }}</span>
          <span class="text-xs/5 text-subtle tabular-nums">{{ formatAge(sensor.lastRecordedAt) }}</span>
          <div v-if="sensor.type === 'temperature'" class="mt-1 flex gap-1">
            <span :class="['inline-flex items-center transition-colors', sensor.heaterActive ? 'text-orange-500' : 'text-subtle/60']" title="Heater">
              <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M3 6 Q6 3 9 6 Q12 9 15 6 Q18 3 21 6"/>
                <path d="M3 12 Q6 9 9 12 Q12 15 15 12 Q18 9 21 12"/>
                <path d="M3 18 Q6 15 9 18 Q12 21 15 18 Q18 15 21 18"/>
              </svg>
            </span>
            <span :class="['inline-flex items-center transition-colors', sensor.fanActive ? 'text-sky-400' : 'text-subtle/60']" title="Fan">
              <svg class="size-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6.93-1A7 7 0 0 0 13 4.07V2h-2v2.07A7 7 0 0 0 5.07 10H3v2h2.07A7 7 0 0 0 11 19.93V22h2v-2.07A7 7 0 0 0 18.93 13H21v-2h-2.07zM12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/></svg>
            </span>
          </div>
        </div>

        <!-- Trailing actions — fixed width reservation so trailing/value column stays aligned across rows. -->
        <div class="flex w-[108px] shrink-0 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
          <button v-if="sensor.type === 'temperature' && sensor.deviceId" class="btn-icon !size-8" title="Configure" @click="configuringSensor = sensor">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button v-if="sensor.id !== null" class="btn-icon !size-8" title="Edit" @click="openEdit(sensor)">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
          <button class="btn-icon !size-8 hover:!text-red-600 dark:hover:!text-red-400" title="Remove" @click="pendingDelete = sensor">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </li>
    </ul>

    <section v-if="visibleBlocked.length">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">Hidden sensors ({{ visibleBlocked.length }})</h2>
      <ul role="list" class="rounded-2xl ring-1 ring-default/70 dark:ring-white/5 divide-y divide-default">
        <li v-for="b in visibleBlocked" :key="`${b.deviceId}:${b.type}`" class="flex items-center gap-4 px-5 py-3 first:rounded-t-2xl last:rounded-b-2xl bg-surface-2/60">
          <span class="text-base">{{ typeIcon[b.type] ?? '?' }}</span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-muted">{{ typeLabel[b.type] || b.type }}</div>
            <div class="text-xs text-subtle font-mono truncate">{{ b.deviceId }}</div>
          </div>
          <button class="btn-secondary btn-sm" @click="restoreBlocked(b)">Restore</button>
        </li>
      </ul>
    </section>
  </div>

  <SensorConfigModal
    v-if="configuringSensor?.deviceId"
    :device-id="configuringSensor.deviceId"
    :label="configuringSensor.label"
    @close="configuringSensor = null"
  />

  <ConfirmDialog
    v-if="pendingDelete"
    :message="pendingDelete.id === null
      ? `Hide sensor &quot;${pendingDelete.label || typeLabel[pendingDelete.type] || pendingDelete.type}&quot;? You can restore it from the Hidden sensors section below.`
      : `Delete sensor &quot;${pendingDelete.label || typeLabel[pendingDelete.type] || pendingDelete.type}&quot;?`"
    :confirm-label="pendingDelete.id === null ? 'Hide' : 'Delete'"
    @confirm="confirmDelete"
    @cancel="pendingDelete = null"
  />

  <AppDialog v-if="editingSensor" :open="true" max-width-class="max-w-md" @close="editingSensor = null">
    <div class="p-6 space-y-4">
      <div class="flex items-center gap-3">
        <span class="text-2xl">{{ typeIcon[editingSensor.type] ?? '?' }}</span>
        <div>
          <h3 class="text-base font-semibold text-text">{{ typeLabel[editingSensor.type] || editingSensor.type }}</h3>
          <div v-if="editingSensor.deviceId" class="text-xs text-subtle font-mono mt-0.5">{{ editingSensor.deviceId }}</div>
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
          @keydown.escape="editingSensor = null"
        />
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button class="btn-secondary" @click="editingSensor = null">Cancel</button>
        <button class="btn-primary" @click="saveEdit">Save</button>
      </div>
    </div>
  </AppDialog>
</template>
