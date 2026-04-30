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
      `/api/sensors/config/${props.deviceId}`,
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
  <AppDialog :open="true" max-width-class="max-w-lg" @close="emit('close')">
    <div class="px-6 pt-5 pb-4 border-b border-default">
      <div class="flex items-center gap-3">
        <div class="flex size-10 items-center justify-center rounded-2xl bg-accent-soft ring-1 ring-accent/20 text-xl">⚙️</div>
        <div class="min-w-0 flex-1">
          <h3 class="text-base/6 font-semibold text-text truncate">{{ label || 'Temperature sensor' }}</h3>
          <div class="text-xs text-subtle font-mono mt-0.5 truncate">{{ deviceId }}</div>
        </div>
        <span v-if="pending" class="badge badge-warning">Pending sync</span>
        <span v-else-if="lastFetchedAt" class="badge badge-success">Synced</span>
      </div>
    </div>

    <div class="px-6 py-5 space-y-4">
      <div v-if="loading" class="text-center py-6 text-sm text-subtle">Loading…</div>
      <div v-else-if="fetchError" class="rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-sm text-error">{{ fetchError }}</div>

      <template v-else>
        <div>
          <label class="label">Target temperature (°C)</label>
          <input
            v-model.number="form.refTemp"
            type="number"
            step="0.5"
            class="input mt-1.5"
            placeholder="Use room reference"
          />
          <p class="help-text">Leave blank to fall back to the room reference.</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Heater ON offset</label>
            <input v-model.number="form.heaterOnOffset" type="number" step="0.5" min="0" class="input mt-1.5" />
            <p class="help-text">°C below target.</p>
          </div>
          <div>
            <label class="label">Heater OFF offset</label>
            <input v-model.number="form.heaterOffOffset" type="number" step="0.5" min="0" class="input mt-1.5" />
            <p class="help-text">°C above target.</p>
          </div>
        </div>

        <div>
          <label class="label">Fan threshold</label>
          <input v-model.number="form.fanThreshold" type="number" step="0.5" min="0" class="input mt-1.5" />
          <p class="help-text">°C above target before the fan runs.</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Sensor poll interval</label>
            <input v-model.number="form.pollInterval" type="number" step="1" min="1" class="input mt-1.5" />
            <p class="help-text">Seconds.</p>
          </div>
          <div>
            <label class="label">Config fetch interval</label>
            <input v-model.number="form.configFetchInterval" type="number" step="1" min="10" class="input mt-1.5" />
            <p class="help-text">Seconds.</p>
          </div>
        </div>
      </template>
    </div>

    <div v-if="!loading && !fetchError" class="flex items-center justify-end gap-2 px-6 py-4 border-t border-default bg-surface-2/50">
      <button class="btn-secondary" @click="emit('close')">Cancel</button>
      <button class="btn-primary" :disabled="saving" @click="save">
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
    </div>
  </AppDialog>
</template>
