<script setup lang="ts">
import type { SensorView, LightGroupView } from '../../shared/types'

const props = defineProps<{
  roomId: number
  roomName: string
  // Lights in the room available for grouping
  lights: SensorView[]
  // Existing group to edit, or null for create
  group: LightGroupView | null
  // All groups in the room (used to mark lights already in another group)
  groupsInRoom: LightGroupView[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
  (e: 'deleted'): void
}>()

const name = ref(props.group?.name ?? '')
const selectedIds = ref<Set<number>>(new Set(props.group?.memberSensorIds ?? []))
const error = ref<string | null>(null)
const saving = ref(false)
const confirmDelete = ref(false)

// Map from sensorId → other group's name (so we can mark a light as "in: <other>")
const otherGroupBySensor = computed<Map<number, string>>(() => {
  const map = new Map<number, string>()
  for (const g of props.groupsInRoom) {
    if (props.group && g.id === props.group.id) continue
    for (const sid of g.memberSensorIds) map.set(sid, g.name)
  }
  return map
})

function toggleLight(id: number) {
  if (otherGroupBySensor.value.has(id)) return
  if (selectedIds.value.has(id)) selectedIds.value.delete(id)
  else selectedIds.value.add(id)
  // trigger reactivity
  selectedIds.value = new Set(selectedIds.value)
}

const trimmedName = computed(() => name.value.trim())
// In edit mode, dropping below 2 members auto-ungroups instead of being a validation error.
const isEdit = computed(() => !!props.group)
const willUngroup = computed(() => isEdit.value && selectedIds.value.size < 2)
const canSave = computed(() => {
  if (trimmedName.value.length === 0) return false
  if (isEdit.value) return true
  return selectedIds.value.size >= 2
})

const validationMessage = computed(() => {
  if (trimmedName.value.length === 0) return 'Group needs a name'
  if (!isEdit.value && selectedIds.value.size < 2) return 'Pick at least two lights'
  return null
})

const saveLabel = computed(() => {
  if (!isEdit.value) return 'Create'
  if (willUngroup.value) return 'Ungroup'
  return 'Save'
})

const hasMixedCapability = computed(() => {
  let hasBri = false, hasNoBri = false
  for (const id of selectedIds.value) {
    const l = props.lights.find(x => x.id === id)
    if (!l) continue
    if (l.capabilities?.brightness) hasBri = true
    else hasNoBri = true
  }
  return hasBri && hasNoBri
})

async function save() {
  if (!canSave.value) return
  if (willUngroup.value) {
    await ungroup()
    return
  }
  saving.value = true
  error.value = null
  try {
    const sensorIds = [...selectedIds.value]
    if (props.group) {
      await $fetch(`/api/light-groups/${props.group.id}`, {
        method: 'PATCH',
        body: { name: trimmedName.value, sensorIds },
      })
    } else {
      await $fetch(`/api/rooms/${props.roomId}/light-groups`, {
        method: 'POST',
        body: { name: trimmedName.value, sensorIds },
      })
    }
    emit('saved')
  } catch (err: unknown) {
    const e = err as { data?: { error?: string; message?: string }; statusMessage?: string; message?: string }
    error.value = e.data?.message ?? e.statusMessage ?? e.message ?? 'failed'
  } finally {
    saving.value = false
  }
}

async function ungroup() {
  if (!props.group) return
  saving.value = true
  error.value = null
  try {
    await $fetch(`/api/light-groups/${props.group.id}`, { method: 'DELETE' })
    emit('deleted')
  } catch (err: unknown) {
    const e = err as { message?: string }
    error.value = e.message ?? 'failed'
  } finally {
    saving.value = false
    confirmDelete.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-icon">💡✨</span>
          <div>
            <div class="modal-title">{{ group ? 'Edit light group' : 'Group lights' }}</div>
            <div class="modal-room">{{ roomName }}</div>
          </div>
        </div>

        <label class="modal-field">
          <span>Group name</span>
          <input
            v-model="name"
            class="modal-input"
            placeholder="e.g. Reading nook"
            maxlength="60"
            autofocus
            @keydown.enter="save"
            @keydown.escape="emit('close')"
          />
        </label>

        <div class="modal-field">
          <span>Lights</span>
          <div v-if="lights.length === 0" class="empty">This room has no lights to group.</div>
          <div v-else class="light-list">
            <label
              v-for="l in lights"
              :key="l.id"
              class="light-row"
              :class="{ disabled: otherGroupBySensor.has(l.id), checked: selectedIds.has(l.id) }"
            >
              <input
                type="checkbox"
                :checked="selectedIds.has(l.id)"
                :disabled="otherGroupBySensor.has(l.id)"
                @change="toggleLight(l.id)"
              />
              <span class="light-name">{{ l.label?.trim() || l.hueName?.trim() || `Light #${l.id}` }}</span>
              <span v-if="otherGroupBySensor.has(l.id)" class="hint">in group: {{ otherGroupBySensor.get(l.id) }}</span>
              <span v-else-if="!l.capabilities?.brightness" class="hint dim">on/off only</span>
            </label>
          </div>
        </div>

        <div v-if="hasMixedCapability" class="note">
          Some lights don't support brightness. The master slider will only affect dimmable lights; the toggle still controls all of them.
        </div>
        <div v-if="willUngroup" class="note">
          A group needs at least two lights — saving with fewer will ungroup them.
        </div>

        <div v-if="validationMessage && (name || selectedIds.size > 0)" class="validation">
          {{ validationMessage }}
        </div>
        <div v-if="error" class="error">{{ error }}</div>

        <div class="modal-actions">
          <button v-if="group" class="btn-delete" :disabled="saving" @click="confirmDelete = true">Ungroup</button>
          <span class="spacer" />
          <button class="btn-cancel" :disabled="saving" @click="emit('close')">Cancel</button>
          <button
            class="btn-save"
            :class="{ 'btn-warn': willUngroup }"
            :disabled="!canSave || saving"
            @click="save"
          >{{ saveLabel }}</button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-if="confirmDelete"
      :message="`Ungroup &quot;${group?.name ?? ''}&quot;? The lights stay in the room and become individually controllable again.`"
      confirm-label="Ungroup"
      @confirm="ungroup"
      @cancel="confirmDelete = false"
    />
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 200; padding: 24px;
}
.modal-card {
  background: #1e2130; border: 1px solid #2a2f45; border-radius: 12px;
  padding: 24px; width: 100%; max-width: 440px;
  max-height: 80vh; overflow-y: auto;
  display: flex; flex-direction: column; gap: 18px;
}
.modal-header { display: flex; align-items: center; gap: 12px; }
.modal-icon { font-size: 1.6rem; }
.modal-title { font-size: 1rem; font-weight: 700; color: #e2e8f0; }
.modal-room { font-size: 0.7rem; color: #64748b; margin-top: 2px; }
.modal-field { display: flex; flex-direction: column; gap: 6px; font-size: 0.8rem; color: #94a3b8; }
.modal-input {
  background: #0f1117; border: 1px solid #2a2f45;
  border-radius: 8px; padding: 9px 12px;
  color: #e2e8f0; font-size: 0.9rem; outline: none;
  transition: border-color 0.15s;
}
.modal-input:focus { border-color: #4a6fa5; }

.light-list {
  display: flex; flex-direction: column; gap: 4px;
  background: #0f1117; border: 1px solid #2a2f45; border-radius: 8px;
  padding: 6px; max-height: 240px; overflow-y: auto;
}
.light-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 6px; cursor: pointer;
  transition: background 0.15s;
}
.light-row:hover:not(.disabled) { background: #151825; }
.light-row.checked { background: #1d2238; }
.light-row.disabled { cursor: not-allowed; opacity: 0.55; }
.light-row input[type="checkbox"] { accent-color: #4a6fa5; }
.light-name { flex: 1; color: #e2e8f0; font-size: 0.85rem; }
.hint { font-size: 0.65rem; color: #f87171; font-style: italic; }
.hint.dim { color: #64748b; }

.note {
  font-size: 0.72rem; color: #fbbf24;
  background: rgba(251, 191, 36, 0.06);
  border: 1px solid rgba(251, 191, 36, 0.18);
  border-radius: 6px; padding: 8px 10px;
}
.validation {
  font-size: 0.78rem; color: #f87171;
  background: rgba(248, 113, 113, 0.08);
  border-radius: 6px; padding: 8px 10px;
}
.error {
  font-size: 0.78rem; color: #f87171;
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 6px; padding: 8px 10px;
}
.empty { font-size: 0.78rem; color: #475569; padding: 12px; text-align: center; }

.modal-actions { display: flex; align-items: center; gap: 8px; }
.spacer { flex: 1; }
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
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-save:not(:disabled):hover { background: #6b93c7; }
.btn-save.btn-warn { background: #b45309; }
.btn-save.btn-warn:not(:disabled):hover { background: #d97706; }
.btn-delete {
  background: none; color: #f87171; border: 1px solid rgba(248, 113, 113, 0.4);
  border-radius: 8px; padding: 7px 14px; font-size: 0.85rem;
  cursor: pointer; transition: background 0.15s;
}
.btn-delete:hover { background: rgba(248, 113, 113, 0.08); }
.btn-delete:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
