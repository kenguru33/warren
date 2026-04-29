<script setup lang="ts">
import type { SensorView, LightGroupView } from '../../shared/types'
import type { LightThemeKey } from '../../shared/utils/light-themes'

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
const themeKey = ref<LightThemeKey>(props.group?.theme ?? DEFAULT_LIGHT_THEME)
const selectedIds = ref<Set<number>>(new Set(props.group?.memberSensorIds ?? []))
const error = ref<string | null>(null)
const saving = ref(false)
const confirmDelete = ref(false)

const themes = Object.values(LIGHT_THEMES)
const selectedTheme = computed(() => LIGHT_THEMES[themeKey.value])

const themeOpen = ref(false)
const themeBtnRef = ref<HTMLButtonElement | null>(null)
const themeMenuRef = ref<HTMLDivElement | null>(null)
const themeMenuPos = ref<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })

function positionMenu() {
  const el = themeBtnRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  themeMenuPos.value = { top: r.bottom + 4, left: r.left, width: r.width }
}

watch(themeOpen, (open) => {
  if (open) {
    positionMenu()
    nextTick(() => positionMenu())
  }
})

async function pickTheme(key: LightThemeKey) {
  themeKey.value = key
  themeOpen.value = false
  themeBtnRef.value?.focus()

  // Live preview: fire-and-forget paint with the new palette. Only meaningful for an
  // existing group (new groups don't exist server-side yet) with at least one light on
  // (off bulbs ignore color changes, and we never auto-turn-them-on for a preview).
  // The Save button still persists the theme; this preview is non-persistent.
  if (!props.group || props.group.state === 'all-off') return
  try {
    await $fetch(`/api/light-groups/${props.group.id}/state`, {
      method: 'POST',
      body: { on: true, theme: key },
    })
  } catch {
    // Silent — Save still works, and the dropdown change is reflected in the tile UI
    // via the local `themeKey` ref regardless.
  }
}

function onDocClick(e: MouseEvent) {
  if (!themeOpen.value) return
  const t = e.target as Node
  if (themeBtnRef.value?.contains(t)) return
  if (themeMenuRef.value?.contains(t)) return
  themeOpen.value = false
}

function onWindowChange() {
  if (themeOpen.value) positionMenu()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocClick)
  window.addEventListener('resize', onWindowChange)
  window.addEventListener('scroll', onWindowChange, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})

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
        body: { name: trimmedName.value, sensorIds, theme: themeKey.value },
      })
    } else {
      await $fetch(`/api/rooms/${props.roomId}/light-groups`, {
        method: 'POST',
        body: { name: trimmedName.value, sensorIds, theme: themeKey.value },
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

        <div class="modal-field theme-field">
          <span>Color</span>
          <button
            ref="themeBtnRef"
            type="button"
            class="theme-trigger"
            :aria-expanded="themeOpen"
            aria-haspopup="listbox"
            @click="themeOpen = !themeOpen"
            @keydown.escape="themeOpen = false"
          >
            <span class="theme-swatch" :style="{ background: selectedTheme.swatch }" aria-hidden="true" />
            <span class="theme-label">{{ selectedTheme.label }}</span>
            <svg class="theme-chevron" :class="{ open: themeOpen }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>

        <Teleport to="body">
          <div
            v-if="themeOpen"
            ref="themeMenuRef"
            class="theme-menu"
            role="listbox"
            :aria-activedescendant="`theme-opt-${themeKey}`"
            :style="{ top: `${themeMenuPos.top}px`, left: `${themeMenuPos.left}px`, width: `${themeMenuPos.width}px` }"
          >
            <button
              v-for="t in themes"
              :id="`theme-opt-${t.key}`"
              :key="t.key"
              type="button"
              class="theme-option"
              :class="{ selected: themeKey === t.key }"
              role="option"
              :aria-selected="themeKey === t.key"
              @click="pickTheme(t.key)"
            >
              <span class="theme-swatch" :style="{ background: t.swatch }" aria-hidden="true" />
              <span class="theme-label">{{ t.label }}</span>
              <span class="theme-palette" aria-hidden="true">
                <span
                  v-for="c in t.bulbPalette"
                  :key="c"
                  class="palette-dot"
                  :style="{ background: c }"
                />
              </span>
              <svg
                v-if="themeKey === t.key"
                class="theme-check"
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2.5"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </button>
          </div>
        </Teleport>

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
  scrollbar-width: thin;
  scrollbar-color: #2a2f45 transparent;
}
.modal-card::-webkit-scrollbar { width: 8px; }
.modal-card::-webkit-scrollbar-track { background: transparent; }
.modal-card::-webkit-scrollbar-thumb {
  background: #2a2f45;
  border-radius: 4px;
  border: 2px solid #1e2130;
}
.modal-card::-webkit-scrollbar-thumb:hover { background: #3a4055; }
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
  scrollbar-width: thin;
  scrollbar-color: #2a2f45 transparent;
}
.light-list::-webkit-scrollbar { width: 8px; }
.light-list::-webkit-scrollbar-track { background: transparent; }
.light-list::-webkit-scrollbar-thumb {
  background: #2a2f45;
  border-radius: 4px;
  border: 2px solid #0f1117;
}
.light-list::-webkit-scrollbar-thumb:hover { background: #3a4055; }
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

.theme-field {
  position: relative;
}

.theme-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #0f1117;
  border: 1px solid #2a2f45;
  border-radius: 8px;
  padding: 7px 10px 7px 8px;
  color: #e2e8f0;
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color 0.15s;
  text-align: left;
  width: 100%;
}
.theme-trigger:hover,
.theme-trigger[aria-expanded="true"] {
  border-color: #4a6fa5;
}

.theme-swatch {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.theme-label {
  flex: 1;
  color: #e2e8f0;
  font-weight: 500;
}

.theme-chevron {
  color: #64748b;
  transition: transform 0.15s;
  flex-shrink: 0;
}
.theme-chevron.open { transform: rotate(180deg); }

.theme-menu {
  position: fixed;
  z-index: 300;
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: min(420px, 60vh);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #2a2f45 transparent;
}
.theme-menu::-webkit-scrollbar { width: 8px; }
.theme-menu::-webkit-scrollbar-track { background: transparent; }
.theme-menu::-webkit-scrollbar-thumb {
  background: #2a2f45;
  border-radius: 4px;
  border: 2px solid #1e2130;
}
.theme-menu::-webkit-scrollbar-thumb:hover { background: #3a4055; }

.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  border-radius: 6px;
  padding: 7px 8px;
  color: #cbd5e1;
  font-size: 0.82rem;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.12s;
}
.theme-option:hover,
.theme-option:focus-visible {
  background: #151825;
  outline: none;
}
.theme-option.selected {
  background: #1d2238;
  color: #e2e8f0;
}

.theme-option .theme-label {
  flex: 0 0 auto;
}

.theme-palette {
  flex: 1;
  display: flex;
  gap: 3px;
  justify-content: flex-end;
}
.palette-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.theme-check {
  color: #a0c4ff;
  flex-shrink: 0;
}

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
