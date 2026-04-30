<script setup lang="ts">
import type { LightThemeKey } from '../../shared/utils/light-themes'

const props = defineProps<{
  modelValue: LightThemeKey
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', key: LightThemeKey): void
}>()

const themes = Object.values(LIGHT_THEMES)
const selectedTheme = computed(() => LIGHT_THEMES[props.modelValue])

const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLDivElement | null>(null)
const menuPos = ref<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })

function positionMenu() {
  const el = triggerRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  menuPos.value = { top: r.bottom + 4, left: r.left, width: r.width }
}

watch(open, (isOpen) => {
  if (isOpen) {
    positionMenu()
    nextTick(() => positionMenu())
  }
})

function pick(key: LightThemeKey) {
  emit('update:modelValue', key)
  open.value = false
  triggerRef.value?.focus()
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return
  const t = e.target as Node
  if (triggerRef.value?.contains(t)) return
  if (menuRef.value?.contains(t)) return
  open.value = false
}

function onWindowChange() {
  if (open.value) positionMenu()
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
</script>

<template>
  <button
    ref="triggerRef"
    type="button"
    class="theme-trigger"
    :aria-expanded="open"
    aria-haspopup="listbox"
    @click="open = !open"
    @keydown.escape="open = false"
  >
    <span class="theme-swatch" :style="{ background: selectedTheme.swatch }" aria-hidden="true" />
    <span class="theme-label">{{ selectedTheme.label }}</span>
    <svg class="theme-chevron" :class="{ open }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <path d="M6 9l6 6 6-6"/>
    </svg>
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      ref="menuRef"
      class="theme-menu"
      role="listbox"
      :aria-activedescendant="`theme-opt-${modelValue}`"
      :style="{ top: `${menuPos.top}px`, left: `${menuPos.left}px`, width: `${menuPos.width}px` }"
    >
      <button
        v-for="t in themes"
        :id="`theme-opt-${t.key}`"
        :key="t.key"
        type="button"
        class="theme-option"
        :class="{ selected: modelValue === t.key }"
        role="option"
        :aria-selected="modelValue === t.key"
        @click="pick(t.key)"
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
          v-if="modelValue === t.key"
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
</template>

<style scoped>
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
</style>
