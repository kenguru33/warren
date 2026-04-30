<script setup lang="ts">
import type { SensorView, LightGroupView } from '../../shared/types'
import type { LightThemeKey } from '../../shared/utils/light-themes'

const props = defineProps<{
  roomId: number
  roomName: string
  lights: SensorView[]
  group: LightGroupView | null
  groupsInRoom: LightGroupView[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
  (e: 'deleted'): void
}>()

const name = ref(props.group?.name ?? '')
const themeKey = ref<LightThemeKey>(props.group?.theme ?? DEFAULT_LIGHT_THEME)
// Native checkbox group via v-model on an array — Vue handles add/remove automatically
// when checkboxes are toggled. Avoids the brittleness of :checked + @change with labels.
const selectedIds = ref<number[]>([...(props.group?.memberSensorIds ?? [])])
const error = ref<string | null>(null)
const saving = ref(false)
const confirmDelete = ref(false)
const selectedIdsSet = computed(() => new Set(selectedIds.value))

// Live preview: fire-and-forget paint with the new palette. Only meaningful for an
// existing group with at least one light on. Save still persists the theme; this
// preview is non-persistent.
watch(themeKey, async (key, prev) => {
  if (key === prev) return
  if (!props.group || props.group.state === 'all-off') return
  try {
    await $fetch(`/api/light-groups/${props.group.id}/state`, {
      method: 'POST',
      body: { on: true, theme: key },
    })
  } catch {}
})

const otherGroupBySensor = computed<Map<number, string>>(() => {
  const map = new Map<number, string>()
  for (const g of props.groupsInRoom) {
    if (props.group && g.id === props.group.id) continue
    for (const sid of g.memberSensorIds) map.set(sid, g.name)
  }
  return map
})

const trimmedName = computed(() => name.value.trim())
const isEdit = computed(() => !!props.group)
const willUngroup = computed(() => isEdit.value && selectedIds.value.length < 2)
const canSave = computed(() => {
  if (trimmedName.value.length === 0) return false
  if (isEdit.value) return true
  return selectedIds.value.length >= 2
})

const validationMessage = computed(() => {
  if (trimmedName.value.length === 0) return 'Group needs a name'
  if (!isEdit.value && selectedIds.value.length < 2) return 'Pick at least two lights'
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

function toggleLight(id: number) {
  if (otherGroupBySensor.value.has(id)) return
  const i = selectedIds.value.indexOf(id)
  if (i >= 0) selectedIds.value.splice(i, 1)
  else selectedIds.value.push(id)
}

async function save() {
  if (!canSave.value) return
  if (willUngroup.value) {
    await ungroup()
    return
  }
  saving.value = true
  error.value = null
  try {
    const sensorIds = selectedIds.value.slice()
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
  <AppDialog :open="true" max-width-class="max-w-md" @close="emit('close')">
    <div class="px-6 pt-5 pb-4 border-b border-default">
      <div class="flex items-center gap-3">
        <div class="flex size-10 items-center justify-center rounded-2xl bg-accent-soft ring-1 ring-accent/20 text-xl">💡</div>
        <div class="min-w-0">
          <h3 class="text-base/6 font-semibold text-text truncate">{{ group ? 'Edit light group' : 'Group lights' }}</h3>
          <p class="text-xs text-subtle mt-0.5 truncate">{{ roomName }}</p>
        </div>
      </div>
    </div>

    <div class="px-6 py-5 space-y-4 overflow-y-auto pretty-scroll">
      <div>
        <label class="label">Group name</label>
        <input
          v-model="name"
          class="input mt-1.5"
          placeholder="e.g. Reading nook"
          maxlength="60"
          autofocus
          @keydown.enter="save"
          @keydown.escape="emit('close')"
        />
      </div>

      <div>
        <label class="label">Color theme</label>
        <div class="mt-1.5">
          <LightThemePicker v-model="themeKey" />
        </div>
      </div>

      <div>
        <label class="label">Lights</label>
        <div v-if="lights.length === 0" class="mt-1.5 text-center text-sm text-subtle py-6 rounded-lg bg-surface-2 ring-1 ring-default">
          This room has no lights to group.
        </div>
        <div v-else class="mt-1.5 max-h-56 overflow-y-auto pretty-scroll rounded-lg bg-input ring-1 ring-inset ring-default p-1.5 dark:ring-white/10">
          <button
            v-for="l in lights"
            :key="l.id"
            type="button"
            role="checkbox"
            :aria-checked="selectedIdsSet.has(l.id)"
            :disabled="otherGroupBySensor.has(l.id)"
            :class="[
              'flex w-full items-center gap-3 px-3 py-2 rounded-md text-left transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              otherGroupBySensor.has(l.id)
                ? 'cursor-not-allowed opacity-55'
                : 'cursor-pointer hover:bg-surface-2 dark:hover:bg-white/[0.04]',
              selectedIdsSet.has(l.id) && !otherGroupBySensor.has(l.id) && 'bg-accent/10',
            ]"
            @click="toggleLight(l.id)"
          >
            <span
              :class="[
                'flex size-4 shrink-0 items-center justify-center rounded-md ring-1 transition-colors',
                selectedIdsSet.has(l.id)
                  ? 'bg-accent ring-accent text-white'
                  : 'bg-surface ring-default dark:ring-white/15',
              ]"
              aria-hidden="true"
            >
              <svg v-if="selectedIdsSet.has(l.id)" class="size-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.6a1 1 0 0 1-1.42.006L3.29 9.79a1 1 0 1 1 1.42-1.41l3.79 3.79 6.79-6.88a1 1 0 0 1 1.414-.006Z" clip-rule="evenodd"/></svg>
            </span>
            <span class="flex-1 text-sm text-text truncate">{{ l.label?.trim() || l.hueName?.trim() || `Light #${l.id}` }}</span>
            <span v-if="otherGroupBySensor.has(l.id)" class="badge badge-error">in {{ otherGroupBySensor.get(l.id) }}</span>
            <span v-else-if="!l.capabilities?.brightness" class="badge badge-neutral">on/off</span>
          </button>
        </div>
      </div>

      <div v-if="hasMixedCapability" class="rounded-lg bg-warning/10 ring-1 ring-warning/20 px-3 py-2 text-xs text-warning">
        Some lights don't support brightness. The master slider will only affect dimmable lights.
      </div>
      <div v-if="willUngroup" class="rounded-lg bg-warning/10 ring-1 ring-warning/20 px-3 py-2 text-xs text-warning">
        A group needs at least two lights — saving with fewer will ungroup them.
      </div>
      <div v-if="validationMessage && (name || selectedIds.length > 0)" class="rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-xs text-error">
        {{ validationMessage }}
      </div>
      <div v-if="error" class="rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-xs text-error">{{ error }}</div>
    </div>

    <div class="flex items-center gap-2 px-6 py-4 border-t border-default bg-surface-2/50">
      <button v-if="group" class="btn-danger" :disabled="saving" @click="confirmDelete = true">Ungroup</button>
      <span class="flex-1" />
      <button class="btn-secondary" :disabled="saving" @click="emit('close')">Cancel</button>
      <button
        :class="[willUngroup ? 'btn-danger' : 'btn-primary']"
        :disabled="!canSave || saving"
        @click="save"
      >{{ saveLabel }}</button>
    </div>

    <ConfirmDialog
      v-if="confirmDelete"
      :message="`Ungroup &quot;${group?.name ?? ''}&quot;? The lights stay in the room and become individually controllable again.`"
      confirm-label="Ungroup"
      @confirm="ungroup"
      @cancel="confirmDelete = false"
    />
  </AppDialog>
</template>
