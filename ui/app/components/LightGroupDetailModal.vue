<script setup lang="ts">
import type { LightGroupView, SensorView } from '../../shared/types'
import type { LightThemeKey } from '../../shared/utils/light-themes'

const props = defineProps<{
  group: LightGroupView
  members: SensorView[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
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

// Local theme override — flips the dialog's color instantly on pick, before the next /api/rooms refresh.
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
  // Repaint live so on bulbs reflect the new palette immediately. Off bulbs ignore color
  // and we never auto-turn-them-on for a preview. Fire-and-forget — persistence already done.
  if (props.group.state !== 'all-off') {
    $fetch(`/api/light-groups/${props.group.id}/state`, {
      method: 'POST',
      body: { on: true, theme: key },
    }).catch(() => {})
  }
}

const theme = computed(() => resolveLightTheme(localTheme.value))
const themeVars = computed(() => ({
  '--theme-off-border': theme.value.offBorder,
  '--theme-on-border':  theme.value.onBorder,
  '--theme-on-glow':    theme.value.onGlow,
}))

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click="onBackdropClick">
      <div class="modal" :style="themeVars">
        <div class="modal-header">
          <div class="header-top">
            <div class="title-area">
              <h3 class="title">{{ group.name }}</h3>
              <span class="summary">{{ stateLabel }} · {{ memberLabel }}</span>
            </div>
            <button class="close-btn" title="Close" aria-label="Close" @click="emit('close')">×</button>
          </div>
          <LightThemePicker :model-value="localTheme" @update:model-value="onThemeChange" />
          <p v-if="themeError" class="theme-error">{{ themeError }}</p>
        </div>

        <div class="modal-body">
          <p v-if="sortedMembers.length === 0" class="empty">No lights in this group.</p>
          <ul v-else class="row-list">
            <li v-for="m in sortedMembers" :key="m.id">
              <LightGroupDetailRow :sensor="m" />
            </li>
          </ul>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 250;
  padding: 24px;
}

.modal {
  background: #1e2130;
  border: 1px solid var(--theme-off-border, #2a2f45);
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.55),
    0 0 18px var(--theme-on-glow, transparent);
}

.modal-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid #232839;
}

.header-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.theme-error {
  font-size: 0.72rem;
  color: #f87171;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.25);
  border-radius: 6px;
  padding: 6px 10px;
  margin: 0;
}

.title-area {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #e2e8f0;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary {
  font-size: 0.7rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  font-size: 1.5rem;
  line-height: 1;
  padding: 2px 10px;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}
.close-btn:hover {
  color: #e2e8f0;
  background: #252a3d;
}

.modal-body {
  padding: 14px 20px 20px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #2a2f45 transparent;
}
.modal-body::-webkit-scrollbar { width: 8px; }
.modal-body::-webkit-scrollbar-thumb {
  background: #2a2f45;
  border-radius: 4px;
}

.row-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.empty {
  font-size: 0.85rem;
  color: #64748b;
  text-align: center;
  padding: 24px 0;
  margin: 0;
}
</style>
