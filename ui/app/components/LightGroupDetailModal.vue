<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/20/solid'
import type { LightGroupView, SensorView } from '../../shared/types'
import type { LightThemeKey } from '../../shared/utils/light-themes'

const props = defineProps<{
  group: LightGroupView
  members: SensorView[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggled'): void
  (e: 'edit-sensor', sensorId: number): void
}>()

const sortedMembers = computed(() =>
  [...props.members].sort((a, b) => {
    const an = (a.label?.trim() || a.hueName?.trim() || '').toLowerCase()
    const bn = (b.label?.trim() || b.hueName?.trim() || '').toLowerCase()
    return an.localeCompare(bn)
  }),
)

const stateLabel = computed(() => {
  const onCount = props.members.filter(m => m.lightOn === true && m.lightReachable !== false).length
  const total = props.members.filter(m => m.lightReachable !== false).length
  if (props.group.state === 'mixed') return `${onCount} of ${total} on`
  if (props.group.state === 'all-on') return total === 1 ? 'On' : 'All on'
  return total === 0 ? 'Offline' : 'All off'
})

const memberLabel = computed(() => `${props.group.memberCount} ${props.group.memberCount === 1 ? 'light' : 'lights'}`)

const localTheme = ref<LightThemeKey>(props.group.theme)
const themeError = ref<string | null>(null)

watch(() => props.group.theme, (v) => {
  if (v !== localTheme.value) localTheme.value = v
})

async function onThemeChange(key: LightThemeKey) {
  const prev = localTheme.value
  if (key === prev) return
  localTheme.value = key
  themeError.value = null
  try {
    await $fetch(`/api/light-groups/${props.group.id}`, {
      method: 'PATCH',
      body: { theme: key },
    })
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    themeError.value = e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'Failed to save theme')
    localTheme.value = prev
    return
  }
  if (props.group.state !== 'all-off') {
    $fetch(`/api/light-groups/${props.group.id}/state`, {
      method: 'POST',
      body: { on: true, theme: key },
    }).catch(() => {})
  }
}
</script>

<template>
  <AppDialog :open="true" max-width-class="max-w-lg" @close="emit('close')">
    <div class="px-6 pt-5 pb-4 border-b border-default">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-base/6 font-semibold text-text truncate">{{ group.name }}</h3>
          <p class="mt-0.5 text-xs text-subtle uppercase tracking-wider font-medium">{{ stateLabel }} · {{ memberLabel }}</p>
        </div>
        <button class="btn-icon size-8" title="Close" aria-label="Close" @click="emit('close')">
          <XMarkIcon class="size-4" />
        </button>
      </div>
      <div class="mt-4">
        <label class="label">Color theme</label>
        <div class="mt-1.5">
          <LightThemePicker :model-value="localTheme" @update:model-value="onThemeChange" />
        </div>
        <p v-if="themeError" class="mt-2 rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-xs text-error">{{ themeError }}</p>
      </div>
    </div>

    <div class="px-6 py-5 overflow-y-auto pretty-scroll">
      <p v-if="sortedMembers.length === 0" class="text-center text-sm text-subtle py-6 m-0">
        No lights in this group.
      </p>
      <ul v-else role="list" class="flex flex-col gap-2">
        <li v-for="m in sortedMembers" :key="m.id">
          <LightGroupDetailRow
            :sensor="m"
            @toggled="emit('toggled')"
            @edit-sensor="(id) => emit('edit-sensor', id)"
          />
        </li>
      </ul>
    </div>
  </AppDialog>
</template>
