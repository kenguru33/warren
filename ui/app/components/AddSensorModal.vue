<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/20/solid'
import type { SensorType, DiscoveredSensor } from '../../shared/types'

defineProps<{ roomName: string }>()

interface AddPayload {
  type: SensorType
  sensorId?: number
  deviceId?: string
  label: string
  streamUrl: string
  snapshotUrl: string
}

const emit = defineEmits<{
  (e: 'add', payloads: AddPayload[]): void
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
// Multi-select: keys identify discovered devices uniquely.
const selectedKeys = ref<Set<string>>(new Set())
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

function keyOf(d: DiscoveredSensor): string {
  return d.sensorId != null ? `sensor:${d.sensorId}` : `${d.deviceId}:${d.sensorType}`
}

function toggleDevice(d: DiscoveredSensor) {
  const k = keyOf(d)
  const next = new Set(selectedKeys.value)
  if (next.has(k)) next.delete(k)
  else next.add(k)
  selectedKeys.value = next
}

const selectedSensors = computed<DiscoveredSensor[]>(() =>
  discovered.value.filter(d => selectedKeys.value.has(keyOf(d))),
)
const selectedCount = computed(() => selectedSensors.value.length)

function submit() {
  if (manual.value) {
    emit('add', [{
      type: manualType.value,
      label: label.value.trim(),
      streamUrl: streamUrl.value.trim(),
      snapshotUrl: snapshotUrl.value.trim(),
    }])
  } else if (selectedCount.value > 0) {
    // Custom label only applies when exactly one device is selected — bulk-add uses
    // each device's existing label/hueName.
    const useCustomLabel = selectedCount.value === 1 && label.value.trim().length > 0
    const payloads: AddPayload[] = selectedSensors.value.map(d => ({
      type: d.sensorType as SensorType,
      sensorId: d.sensorId,
      deviceId: d.deviceId ?? undefined,
      label: useCustomLabel ? label.value.trim() : '',
      streamUrl: '',
      snapshotUrl: '',
    }))
    emit('add', payloads)
  }
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

const canSubmit = computed(() => manual.value ? true : selectedCount.value > 0)

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
  if (manual.value) return `Add ${typeLabelText(manualType.value).toLowerCase()}`
  const n = selectedCount.value
  if (n === 0) return 'Add to room'
  if (n === 1) return `Add ${typeLabelText(selectedSensors.value[0].sensorType).toLowerCase()}`
  return `Add ${n} devices`
})
</script>

<template>
  <AppDialog :open="true" max-width-class="max-w-2xl" @close="emit('close')">
    <div class="flex flex-col flex-1 min-h-0">
      <header class="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-default">
        <div>
          <h3 class="text-base/6 font-semibold text-text">Add device</h3>
          <p class="mt-1 text-sm/6 text-muted">to <span class="font-semibold text-text">{{ roomName }}</span></p>
        </div>
        <button class="btn-icon size-8" aria-label="Close" @click="emit('close')">
          <XMarkIcon class="size-4" />
        </button>
      </header>

      <form class="flex flex-col flex-1 min-h-0" @submit.prevent="submit">
        <template v-if="!manual">
          <div class="px-6 pt-5">
            <input
              v-model="search"
              type="text"
              class="input"
              placeholder="Search by name, device ID, type…"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              role="searchbox"
            />
          </div>

          <div v-if="!pending && groupedDiscovered.length > 1" class="flex flex-wrap gap-2 items-center px-6 pt-4">
            <button
              type="button"
              :class="[
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ring-1 ring-inset',
                activeFilter === 'all' ? 'bg-accent/10 text-accent-strong ring-accent/30' : 'bg-surface-2 text-muted ring-default hover:text-text hover:ring-accent',
              ]"
              @click="activeFilter = 'all'"
            >
              All <span class="text-[0.65rem] tabular-nums opacity-70">{{ totalCount }}</span>
            </button>
            <button
              v-for="group in groupedDiscovered"
              :key="group.type"
              type="button"
              :class="[
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ring-1 ring-inset',
                activeFilter === group.type ? 'bg-accent/10 text-accent-strong ring-accent/30' : 'bg-surface-2 text-muted ring-default hover:text-text hover:ring-accent',
              ]"
              @click="activeFilter = group.type"
            >
              <span>{{ group.icon }}</span>
              {{ group.label }}
              <span class="text-[0.65rem] tabular-nums opacity-70">{{ group.items.length }}</span>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto pretty-scroll px-6 py-5 flex flex-col gap-6 min-h-[200px]">
            <div v-if="pending" class="text-center py-12 px-6 text-sm text-subtle">Loading…</div>

            <template v-else-if="visibleGroups.length">
              <section v-for="group in visibleGroups" :key="group.type" class="flex flex-col gap-3">
                <h3 class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-subtle">
                  <span>{{ group.icon }}</span>
                  <span>{{ group.label }}</span>
                  <span class="ml-auto badge badge-neutral">{{ group.items.length }}</span>
                </h3>
                <div class="flex flex-col gap-2">
                  <button
                    v-for="d in group.items"
                    :key="keyOf(d)"
                    type="button"
                    role="checkbox"
                    :aria-checked="selectedKeys.has(keyOf(d))"
                    :class="[
                      'flex items-center gap-4 px-4 py-3 rounded-xl ring-1 cursor-pointer text-left transition',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      selectedKeys.has(keyOf(d))
                        ? 'bg-accent/10 ring-accent/40'
                        : 'bg-surface-2/60 ring-default/70 dark:ring-white/5 hover:bg-surface-2 hover:ring-default dark:hover:ring-white/10',
                    ]"
                    @click="toggleDevice(d)"
                  >
                    <span class="flex size-10 shrink-0 items-center justify-center bg-accent/10 rounded-xl text-lg">{{ sensorIcon(d.sensorType) }}</span>
                    <span class="flex-1 min-w-0">
                      <span class="flex items-center gap-2">
                        <span class="text-sm text-text font-semibold truncate">{{ d.label || d.deviceId || typeLabelText(d.sensorType) }}</span>
                        <span v-if="d.origin === 'hue'" class="badge badge-warning">Hue</span>
                      </span>
                      <span class="block mt-0.5 text-xs text-subtle truncate capitalize">{{ sensorMeta(d) }}</span>
                    </span>
                    <span
                      :class="[
                        'flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset transition-colors',
                        selectedKeys.has(keyOf(d)) ? 'bg-accent ring-accent text-white' : 'ring-default',
                      ]"
                      aria-hidden="true"
                    >
                      <svg v-if="selectedKeys.has(keyOf(d))" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </span>
                  </button>
                </div>
              </section>
            </template>

            <div v-else-if="search" class="text-center py-10 text-sm text-subtle">
              No devices match <strong class="text-muted">"{{ search }}"</strong>.
            </div>

            <div v-else class="text-center py-10 px-6 max-w-md mx-auto">
              <p class="text-base font-semibold text-text">Nothing to discover yet</p>
              <p class="mt-1 text-sm text-muted">Make sure your devices are powered on. ESP32 sensors publish over MQTT; Hue lights and sensors appear after pairing the bridge.</p>
            </div>
          </div>

          <div v-if="selectedCount === 1" class="px-6 pt-3 pb-1">
            <label class="label">Custom label <span class="text-subtle font-normal">(optional)</span></label>
            <input v-model="label" class="input mt-2" :placeholder="selectedSensors[0].label || selectedSensors[0].deviceId || 'Friendly name'" maxlength="60" />
          </div>
          <div v-else-if="selectedCount > 1" class="px-6 pt-3 pb-1 text-xs text-subtle">
            {{ selectedCount }} devices selected — they keep their existing labels (you can rename them later).
          </div>
        </template>

        <template v-else>
          <div class="px-6 pt-5 space-y-4">
            <div>
              <label class="label">Type</label>
              <div class="mt-2 grid grid-cols-2 gap-2">
                <button
                  v-for="opt in manualTypes"
                  :key="opt.value"
                  type="button"
                  :class="[
                    'flex flex-col items-center gap-1.5 px-2 py-4 rounded-xl ring-1 ring-inset text-sm font-medium transition cursor-pointer',
                    manualType === opt.value
                      ? 'bg-accent/10 text-accent-strong ring-accent/40'
                      : 'bg-surface-2 text-muted ring-default hover:text-text hover:ring-accent',
                  ]"
                  @click="manualType = opt.value"
                >
                  <span class="text-2xl">{{ opt.icon }}</span>
                  <span>{{ opt.label }}</span>
                </button>
              </div>
            </div>

            <div>
              <label class="label">Label <span class="text-subtle font-normal">(optional)</span></label>
              <input v-model="label" class="input mt-2" placeholder="e.g. Front door, Living room…" maxlength="60" />
            </div>

            <template v-if="manualType === 'camera'">
              <div>
                <label class="label">Stream URL <span class="text-subtle font-normal">(MJPEG / HLS)</span></label>
                <input v-model="streamUrl" class="input mt-2" placeholder="http://…" />
              </div>
              <div>
                <label class="label">Snapshot URL <span class="text-subtle font-normal">(optional)</span></label>
                <input v-model="snapshotUrl" class="input mt-2" placeholder="http://…" />
              </div>
            </template>
          </div>
        </template>

        <footer class="flex items-center justify-between gap-4 px-6 py-4 mt-5 border-t border-default bg-surface-2/50">
          <button type="button" class="text-sm/6 font-medium text-accent-strong hover:underline" @click="manual = !manual; selectedKeys = new Set()">
            {{ manual ? '← Back to discovered devices' : 'Add a camera or motion sensor manually' }}
          </button>
          <div class="flex gap-2">
            <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="!canSubmit">{{ submitLabel }}</button>
          </div>
        </footer>
      </form>
    </div>
  </AppDialog>
</template>
