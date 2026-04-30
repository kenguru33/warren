<script setup lang="ts">
const emit = defineEmits<{
  (e: 'paired'): void
  (e: 'cancel'): void
}>()

interface Candidate { id: string; ip: string; name: string | null; model: string | null }

type Step = 'discovering' | 'choose' | 'manual' | 'waiting' | 'success' | 'error'

const step = ref<Step>('discovering')
const candidates = ref<Candidate[]>([])
const manualIp = ref('')
const errorMsg = ref<string | null>(null)
const countdown = ref(30)
let countdownTimer: ReturnType<typeof setInterval> | null = null

async function discover() {
  step.value = 'discovering'
  errorMsg.value = null
  try {
    candidates.value = await $fetch<Candidate[]>('/api/integrations/hue/discover', { method: 'POST' })
    step.value = candidates.value.length > 0 ? 'choose' : 'manual'
  } catch (err: unknown) {
    const e = err as { message?: string }
    errorMsg.value = e.message ?? 'discovery failed'
    step.value = 'manual'
  }
}

function startCountdown() {
  countdown.value = 30
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

async function pair(ip: string) {
  if (!ip) return
  errorMsg.value = null
  step.value = 'waiting'
  startCountdown()
  try {
    await $fetch('/api/integrations/hue/pair', { method: 'POST', body: { ip } })
    stopCountdown()
    step.value = 'success'
    setTimeout(() => emit('paired'), 600)
  } catch (err: unknown) {
    stopCountdown()
    const e = err as { data?: { error?: string; message?: string }; message?: string }
    const code = e.data?.error
    if (code === 'link_button_timeout') {
      errorMsg.value = 'We did not see the link button being pressed in time.'
    } else if (code === 'bridge_unreachable') {
      errorMsg.value = 'Could not reach the bridge at that address.'
    } else {
      errorMsg.value = e.data?.message ?? e.message ?? 'pairing failed'
    }
    step.value = 'error'
  }
}

onMounted(() => discover())
onBeforeUnmount(() => stopCountdown())
</script>

<template>
  <AppDialog :open="true" max-width-class="max-w-md" @close="step !== 'waiting' && emit('cancel')">
    <div class="flex items-center justify-between px-6 pt-5 pb-4 border-b border-default">
      <h3 class="text-base/6 font-semibold text-text">Connect Hue Bridge</h3>
      <button v-if="step !== 'waiting'" class="btn-icon size-8" aria-label="Close" @click="emit('cancel')">
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <div class="px-6 py-6 min-h-[260px] flex">
      <div v-if="step === 'discovering'" class="flex-1 flex flex-col items-center justify-center gap-4">
        <div class="size-10 border-[3px] border-default border-t-accent rounded-full animate-spin" />
        <p class="text-sm/6 text-muted">Looking for Hue bridges on your network…</p>
      </div>

      <div v-else-if="step === 'choose'" class="flex-1 flex flex-col gap-4">
        <p class="text-sm/6 text-muted">Found {{ candidates.length }} bridge{{ candidates.length === 1 ? '' : 's' }} on your network.</p>
        <ul role="list" class="space-y-2">
          <li v-for="c in candidates" :key="c.id">
            <button
              class="w-full flex items-center justify-between gap-3 rounded-xl bg-surface-2/60 ring-1 ring-default px-4 py-3 cursor-pointer transition hover:bg-surface-2 hover:ring-accent dark:ring-white/5 dark:hover:ring-accent"
              @click="pair(c.ip)"
            >
              <span class="text-sm font-semibold text-text">{{ c.name || 'Hue Bridge' }}</span>
              <span class="text-xs text-subtle font-mono">{{ c.ip }}</span>
            </button>
          </li>
        </ul>
        <button class="text-sm/6 font-medium text-accent-strong hover:underline self-start" @click="step = 'manual'">Enter IP manually instead</button>
      </div>

      <div v-else-if="step === 'manual'" class="flex-1 flex flex-col gap-4">
        <div>
          <label class="label">Bridge IP address</label>
          <input
            v-model="manualIp"
            class="input mt-1.5 font-mono"
            placeholder="192.168.1.42"
            @keyup.enter="pair(manualIp)"
          >
        </div>
        <div class="mt-auto flex gap-2 justify-end items-center">
          <button class="mr-auto text-sm/6 font-medium text-accent-strong hover:underline" @click="discover">Re-run discovery</button>
          <button class="btn-primary" :disabled="!manualIp.trim()" @click="pair(manualIp.trim())">Pair</button>
        </div>
      </div>

      <div v-else-if="step === 'waiting'" class="flex-1 flex flex-col items-center justify-center gap-4 text-center">
        <div class="text-5xl animate-warren-pulse">🔘</div>
        <h3 class="text-base/6 font-semibold text-text">Press the link button on your bridge</h3>
        <p class="text-sm/6 text-muted max-w-xs">The round button on top of the bridge. We're waiting for it…</p>
        <div class="text-2xl font-bold text-accent tabular-nums">{{ countdown }}s</div>
      </div>

      <div v-else-if="step === 'success'" class="flex-1 flex flex-col items-center justify-center gap-3">
        <div class="size-12 rounded-full bg-success/15 ring-1 ring-success/30 text-success text-2xl font-bold flex items-center justify-center">✓</div>
        <p class="text-sm/6 text-muted">Bridge paired successfully.</p>
      </div>

      <div v-else-if="step === 'error'" class="flex-1 flex flex-col items-center gap-4">
        <div class="size-12 rounded-full bg-error/15 ring-1 ring-error/30 text-error text-xl font-bold flex items-center justify-center mt-2">!</div>
        <p class="text-sm/6 text-error text-center">{{ errorMsg }}</p>
        <div class="mt-auto flex gap-2 items-center w-full">
          <button class="mr-auto text-sm/6 font-medium text-muted hover:text-text" @click="emit('cancel')">Cancel</button>
          <button class="btn-primary" @click="discover">Try again</button>
        </div>
      </div>
    </div>
  </AppDialog>
</template>
