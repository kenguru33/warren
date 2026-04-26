<script setup lang="ts">
const props = defineProps<{
  deviceId: string
  label: string | null
}>()

const emit = defineEmits<{ close: [] }>()

const saving = ref(false)
const loading = ref(true)
const fetchError = ref<string | null>(null)

const form = ref({
  refTemp: null as number | null,
  heaterOnOffset: 2.0,
  heaterOffOffset: 2.0,
  fanThreshold: 10.0,
  pollInterval: 5,
  configFetchInterval: 60,
})

const updatedAt = ref<string | null>(null)
const lastFetchedAt = ref<string | null>(null)

const pending = computed(() => {
  if (!updatedAt.value || !lastFetchedAt.value) return false
  return new Date(lastFetchedAt.value) < new Date(updatedAt.value)
})

onMounted(async () => {
  try {
    const data = await $fetch<typeof form.value & { updatedAt: string | null; lastFetchedAt: string | null }>(
      `/api/sensors/config/${props.deviceId}`
    )
    form.value = {
      refTemp: data.refTemp,
      heaterOnOffset: data.heaterOnOffset,
      heaterOffOffset: data.heaterOffOffset,
      fanThreshold: data.fanThreshold,
      pollInterval: data.pollInterval,
      configFetchInterval: data.configFetchInterval,
    }
    updatedAt.value = data.updatedAt
    lastFetchedAt.value = data.lastFetchedAt
  } catch (e: unknown) {
    fetchError.value = e instanceof Error ? e.message : 'Failed to load config'
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  await $fetch(`/api/sensors/config/${props.deviceId}`, {
    method: 'PUT',
    body: form.value,
  })
  saving.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-icon">⚙️</span>
          <div>
            <div class="modal-title">{{ label || 'Temperature sensor' }}</div>
            <div class="modal-device-id">{{ deviceId }}</div>
          </div>
        </div>

        <div v-if="loading" class="loading">Loading…</div>
        <div v-else-if="fetchError" class="loading" style="color:#f87171">{{ fetchError }}</div>

        <template v-else>
          <div class="fields">
            <label class="field">
              <span class="field-label">Target temperature (°C)</span>
              <input
                v-model.number="form.refTemp"
                type="number"
                step="0.5"
                class="field-input"
                placeholder="Use room reference"
              />
            </label>

            <div class="field-row">
              <label class="field">
                <span class="field-label">Heater ON offset (°C below target)</span>
                <input v-model.number="form.heaterOnOffset" type="number" step="0.5" min="0" class="field-input" />
              </label>
              <label class="field">
                <span class="field-label">Heater OFF offset (°C above target)</span>
                <input v-model.number="form.heaterOffOffset" type="number" step="0.5" min="0" class="field-input" />
              </label>
            </div>

            <label class="field">
              <span class="field-label">Fan threshold (°C above target)</span>
              <input v-model.number="form.fanThreshold" type="number" step="0.5" min="0" class="field-input" />
            </label>

            <div class="field-row">
              <label class="field">
                <span class="field-label">Sensor poll interval (s)</span>
                <input v-model.number="form.pollInterval" type="number" step="1" min="1" class="field-input" />
              </label>
              <label class="field">
                <span class="field-label">Config fetch interval (s)</span>
                <input v-model.number="form.configFetchInterval" type="number" step="1" min="10" class="field-input" />
              </label>
            </div>
          </div>

          <div v-if="pending" class="status pending">
            Pending device acknowledgement
          </div>
          <div v-else-if="lastFetchedAt" class="status synced">
            Device synced
          </div>

          <div class="modal-actions">
            <button class="btn-cancel" @click="emit('close')">Cancel</button>
            <button class="btn-save" :disabled="saving" @click="save">
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 24px;
}

.modal-card {
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-icon { font-size: 1.6rem; }

.modal-title {
  font-size: 1rem;
  font-weight: 700;
  color: #e2e8f0;
}

.modal-device-id {
  font-size: 0.7rem;
  color: #475569;
  font-family: monospace;
  margin-top: 2px;
}

.loading {
  color: #64748b;
  font-size: 0.85rem;
  text-align: center;
  padding: 16px 0;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-label {
  font-size: 0.75rem;
  color: #94a3b8;
}

.field-input {
  background: #0f1117;
  border: 1px solid #2a2f45;
  border-radius: 8px;
  padding: 8px 10px;
  color: #e2e8f0;
  font-size: 0.88rem;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}

.field-input:focus { border-color: #4a6fa5; }

.status {
  font-size: 0.75rem;
  padding: 6px 10px;
  border-radius: 6px;
}

.status.pending {
  background: rgba(251, 191, 36, 0.1);
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.2);
}

.status.synced {
  background: rgba(52, 211, 153, 0.1);
  color: #34d399;
  border: 1px solid rgba(52, 211, 153, 0.2);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel {
  background: none;
  color: #64748b;
  border: 1px solid #2a2f45;
  border-radius: 8px;
  padding: 7px 16px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: color 0.15s;
}

.btn-cancel:hover { color: #94a3b8; }

.btn-save {
  background: #4a6fa5;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 7px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-save:hover:not(:disabled) { background: #6b93c7; }
.btn-save:disabled { opacity: 0.5; cursor: default; }
</style>
