<script setup lang="ts">
import type { SensorType, DiscoveredSensor } from '../../shared/types'

defineProps<{ roomName: string }>()

const emit = defineEmits<{
  (e: 'add', payload: { type: SensorType; deviceId?: string; label: string; streamUrl: string; snapshotUrl: string }): void
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

const manualTypes: { value: SensorType; icon: string; label: string }[] = [
  { value: 'camera', icon: '📷', label: 'Camera' },
  { value: 'motion', icon: '🏃', label: 'Motion' },
]

function selectDevice(d: DiscoveredSensor) {
  selected.value = selected.value?.deviceId === d.deviceId && selected.value?.sensorType === d.sensorType ? null : d
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
      deviceId: selected.value.deviceId,
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
  const icons: Record<string, string> = { temperature: '🌡️', humidity: '💧', camera: '📷', motion: '🏃' }
  return icons[type] ?? '📡'
}

function sensorMeta(d: DiscoveredSensor): string {
  if (d.sensorType === 'camera') return `camera · ${timeAgo(d.lastSeen)}`
  return `${d.sensorType} · ${d.latestValue?.toFixed(1)} · ${timeAgo(d.lastSeen)}`
}

const canSubmit = computed(() => manual.value ? true : selected.value !== null)
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click="onBackdropClick">
      <div class="modal">
        <h2 class="title">Add Sensor <span class="room-name">— {{ roomName }}</span></h2>

        <form @submit.prevent="submit">

          <!-- Discovered sensors -->
          <template v-if="!manual">
            <div class="field">
              <label class="field-label">Discovered sensors</label>

              <div v-if="pending" class="empty-state">Loading…</div>

              <template v-else-if="discovered?.length">
                <div class="device-list">
                  <button
                    v-for="d in discovered"
                    :key="`${d.deviceId}:${d.sensorType}`"
                    type="button"
                    class="device-row"
                    :class="{ selected: selected?.deviceId === d.deviceId && selected?.sensorType === d.sensorType }"
                    @click="selectDevice(d)"
                  >
                    <span class="device-icon">{{ sensorIcon(d.sensorType) }}</span>
                    <span class="device-info">
                      <span class="device-id">{{ d.deviceId }}</span>
                      <span class="device-meta">{{ sensorMeta(d) }}</span>
                    </span>
                    <span class="device-check">{{ selected?.deviceId === d.deviceId && selected?.sensorType === d.sensorType ? '✓' : '' }}</span>
                  </button>
                </div>
              </template>

              <div v-else class="empty-state">
                No unassigned sensors found.<br>
                <span class="hint">Make sure your ESP32 devices are publishing to MQTT and Node-RED is running.</span>
              </div>
            </div>

            <div class="field">
              <label class="field-label">Label <span class="optional">(optional)</span></label>
              <input v-model="label" class="input" placeholder="e.g. Main sensor, Window…" maxlength="60" />
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

          <!-- Toggle manual -->
          <button type="button" class="btn-toggle" @click="manual = !manual; selected = null">
            {{ manual ? '← Back to discovered sensors' : '+ Add camera or motion sensor manually' }}
          </button>

          <div class="actions">
            <button type="button" class="btn-cancel" @click="emit('close')">Cancel</button>
            <button type="submit" class="btn-add" :disabled="!canSubmit">Add sensor</button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
}

.modal {
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 16px;
  padding: 28px;
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.title {
  font-size: 1.05rem;
  font-weight: 600;
  color: #e2e8f0;
}

.room-name { color: #64748b; font-weight: 400; }

form { display: flex; flex-direction: column; gap: 16px; }

.field { display: flex; flex-direction: column; gap: 8px; }

.field-label { font-size: 0.8rem; color: #94a3b8; font-weight: 500; }

.optional { color: #475569; font-weight: 400; }

.device-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.device-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s;
  color: inherit;
}

.device-row:hover { border-color: #4a6fa5; }

.device-row.selected { border-color: #4a6fa5; background: #1a2540; }

.device-icon { font-size: 1.2rem; flex-shrink: 0; }

.device-info { display: flex; flex-direction: column; gap: 2px; flex: 1; }

.device-id { font-size: 0.9rem; color: #e2e8f0; font-weight: 500; }

.device-meta { font-size: 0.75rem; color: #64748b; }

.device-check { font-size: 0.9rem; color: #4a6fa5; font-weight: 700; width: 16px; }

.empty-state {
  font-size: 0.85rem;
  color: #475569;
  padding: 16px;
  text-align: center;
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 10px;
  line-height: 1.6;
}

.hint { font-size: 0.8rem; color: #334155; }

.type-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }

.type-btn {
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 10px;
  padding: 10px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 500;
  transition: border-color 0.15s, color 0.15s;
}

.type-btn:hover { border-color: #4a6fa5; color: #94a3b8; }

.type-btn.selected { border-color: #4a6fa5; background: #1a2540; color: #a0c4ff; }

.type-icon { font-size: 1.3rem; }

.input {
  background: #151825;
  border: 1px solid #2a2f45;
  border-radius: 8px;
  padding: 10px 14px;
  color: #e2e8f0;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s;
}

.input:focus { border-color: #4a6fa5; }

.btn-toggle {
  background: none;
  border: none;
  color: #4a6fa5;
  font-size: 0.8rem;
  cursor: pointer;
  text-align: left;
  padding: 0;
}

.btn-toggle:hover { color: #6b93c7; }

.actions { display: flex; gap: 8px; justify-content: flex-end; padding-top: 4px; }

.btn-cancel, .btn-add {
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}

.btn-cancel { background: #151825; color: #64748b; }
.btn-cancel:hover { color: #94a3b8; }
.btn-add { background: #4a6fa5; color: #fff; }
.btn-add:hover:not(:disabled) { background: #6b93c7; }
.btn-add:disabled { opacity: 0.4; cursor: default; }
</style>
