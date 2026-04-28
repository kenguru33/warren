<script setup lang="ts">
interface Props {
  deviceId: string
  bridgeName: string | null
  currentName: string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'saved', row: { name: string; bridgeName: string | null; displayName: string | null }): void
  (e: 'close'): void
}>()

const value = ref(props.currentName ?? '')
const error = ref<string | null>(null)
const saving = ref(false)

const trimmed = computed(() => value.value.trim())
const original = computed(() => props.currentName ?? '')
const unchanged = computed(() => trimmed.value === original.value.trim())

const placeholderText = computed(() => props.bridgeName ?? props.deviceId)
const helper = computed(() =>
  props.bridgeName ? `Hue calls this: ${props.bridgeName}` : '',
)

function useBridgeName() {
  value.value = ''
  error.value = null
}

function friendlyError(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'name_too_long':
      return 'Name must be 32 characters or fewer (Philips Hue limit).'
    case 'bridge_unreachable':
      return "Couldn't reach the Hue Bridge. Check the bridge and try again."
    case 'bridge_unauthorized':
      return 'Hue Bridge rejected the request. Re-pair the bridge and try again.'
    case 'bridge_not_paired':
      return 'No Hue Bridge is paired.'
    case 'unknown_device':
      return 'This device is no longer known to Warren.'
    default:
      return fallback
  }
}

async function save() {
  if (saving.value || unchanged.value) return
  saving.value = true
  error.value = null

  const payload = trimmed.value === '' ? null : trimmed.value
  try {
    const row = await $fetch<{ name: string; bridgeName: string | null; displayName: string | null }>(
      `/api/integrations/hue/devices/${encodeURIComponent(props.deviceId)}/name`,
      { method: 'PATCH', body: { name: payload } },
    )
    emit('saved', row)
    emit('close')
  } catch (err: unknown) {
    const e = err as { data?: { data?: { code?: string }; code?: string }; statusMessage?: string; message?: string }
    const code = e?.data?.data?.code ?? e?.data?.code
    error.value = friendlyError(code, e?.statusMessage ?? e?.message ?? 'Could not save the name. Try again.')
  } finally {
    saving.value = false
  }
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget && !saving.value) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click="onBackdropClick">
      <div class="modal-card" @keydown.escape="emit('close')">
        <div class="modal-header">
          <span class="modal-icon">✏️</span>
          <div>
            <div class="modal-title">Rename Hue device</div>
            <div class="modal-device-id">{{ deviceId }}</div>
          </div>
        </div>

        <label class="modal-field">
          <span>Warren name</span>
          <input
            v-model="value"
            class="modal-input"
            :placeholder="placeholderText"
            maxlength="32"
            autofocus
            @keydown.enter="save"
          />
          <span v-if="helper" class="modal-helper">{{ helper }}</span>
          <span class="modal-helper modal-helper--muted">
            This name is also written to the Philips Hue app.
          </span>
        </label>

        <div v-if="error" class="modal-error">{{ error }}</div>

        <div class="modal-actions">
          <button type="button" class="btn-link" :disabled="saving" @click="useBridgeName">
            Use bridge name
          </button>
          <span class="spacer" />
          <button type="button" class="btn-cancel" :disabled="saving" @click="emit('close')">Cancel</button>
          <button
            type="button"
            class="btn-save"
            :disabled="saving || unchanged"
            @click="save"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
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
  max-width: 380px;
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
  word-break: break-all;
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
  color: #94a3b8;
}

.modal-input {
  background: #0f1117;
  border: 1px solid #2a2f45;
  border-radius: 8px;
  padding: 9px 12px;
  color: #e2e8f0;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s;
}

.modal-input:focus { border-color: #4a6fa5; }

.modal-helper {
  font-size: 0.72rem;
  color: #64748b;
}

.modal-helper--muted { color: #475569; }

.modal-error {
  font-size: 0.8rem;
  color: #f87171;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.25);
  padding: 8px 10px;
  border-radius: 8px;
}

.modal-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.spacer { flex: 1; }

.btn-link {
  background: none;
  color: #64748b;
  border: none;
  padding: 7px 0;
  font-size: 0.78rem;
  cursor: pointer;
  text-decoration: underline;
}
.btn-link:hover:not(:disabled) { color: #94a3b8; }
.btn-link:disabled { opacity: 0.4; cursor: default; }

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
.btn-cancel:hover:not(:disabled) { color: #94a3b8; }
.btn-cancel:disabled { opacity: 0.4; cursor: default; }

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
