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

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget && step.value !== 'waiting') emit('cancel')
}

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
  <Teleport to="body">
    <div class="backdrop" @click="onBackdropClick">
      <div class="modal">
        <header class="modal-header">
          <h2>Connect Hue Bridge</h2>
          <button v-if="step !== 'waiting'" class="close" aria-label="Close" @click="emit('cancel')">×</button>
        </header>

        <div class="body">
          <div v-if="step === 'discovering'" class="state">
            <div class="spinner" />
            <p>Looking for Hue bridges on your network…</p>
          </div>

          <div v-else-if="step === 'choose'" class="state">
            <p class="hint">Found {{ candidates.length }} bridge{{ candidates.length === 1 ? '' : 's' }}. Pick one to pair.</p>
            <ul class="candidates">
              <li v-for="c in candidates" :key="c.id">
                <button class="candidate" @click="pair(c.ip)">
                  <span class="cand-name">{{ c.name || 'Hue Bridge' }}</span>
                  <span class="cand-ip">{{ c.ip }}</span>
                </button>
              </li>
            </ul>
            <button class="link-btn" @click="step = 'manual'">Enter IP manually instead</button>
          </div>

          <div v-else-if="step === 'manual'" class="state">
            <p class="hint">Enter the IP address of your Hue Bridge.</p>
            <input v-model="manualIp" class="ip-input" placeholder="192.168.1.42" @keyup.enter="pair(manualIp)" >
            <div class="row-actions">
              <button class="link-btn" @click="discover">Re-run discovery</button>
              <button class="btn-primary" :disabled="!manualIp.trim()" @click="pair(manualIp.trim())">Pair</button>
            </div>
          </div>

          <div v-else-if="step === 'waiting'" class="state waiting">
            <div class="link-prompt">
              <div class="link-icon">🔘</div>
              <h3>Press the link button on your bridge</h3>
              <p>The round button on top of the bridge. We're waiting for it…</p>
            </div>
            <div class="countdown">{{ countdown }}s</div>
          </div>

          <div v-else-if="step === 'success'" class="state">
            <div class="success-icon">✓</div>
            <p>Bridge paired successfully.</p>
          </div>

          <div v-else-if="step === 'error'" class="state">
            <div class="error-icon">!</div>
            <p class="error-msg">{{ errorMsg }}</p>
            <div class="row-actions">
              <button class="link-btn" @click="emit('cancel')">Cancel</button>
              <button class="btn-primary" @click="discover">Try again</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 200; padding: 24px;
}

.modal {
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 16px;
  width: 100%; max-width: 460px;
  display: flex; flex-direction: column;
}

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 24px; border-bottom: 1px solid #2a2f45;
}
.modal-header h2 { margin: 0; font-size: 1.05rem; font-weight: 600; color: #e2e8f0; }
.close {
  background: none; border: none; color: #64748b; font-size: 1.6rem; line-height: 1;
  cursor: pointer; transition: color 0.12s; padding: 0; width: 28px; height: 28px;
}
.close:hover { color: #e2e8f0; }

.body { padding: 24px; min-height: 240px; display: flex; }

.state { flex: 1; display: flex; flex-direction: column; gap: 16px; align-items: stretch; }
.state.waiting { align-items: center; justify-content: center; }

.spinner {
  width: 36px; height: 36px;
  border: 3px solid #2a2f45;
  border-top-color: #4a6fa5;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
  margin: 16px auto 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.hint { margin: 0; color: #94a3b8; font-size: 0.9rem; }

.candidates { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }

.candidate {
  width: 100%;
  background: #161a26; border: 1px solid #2a2f45; border-radius: 8px;
  padding: 12px 14px;
  display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; transition: border-color 0.12s, background 0.12s;
}
.candidate:hover { border-color: #4a6fa5; background: #1a1f30; }
.cand-name { color: #e2e8f0; font-weight: 600; font-size: 0.9rem; }
.cand-ip { color: #64748b; font-size: 0.8rem; font-family: monospace; }

.link-btn {
  background: none; border: none; color: #93c5fd; font-size: 0.82rem;
  cursor: pointer; padding: 0; align-self: flex-start;
}
.link-btn:hover { color: #c7dbff; text-decoration: underline; }

.ip-input {
  background: #161a26; border: 1px solid #2a2f45; border-radius: 8px;
  padding: 10px 12px; font-size: 0.9rem; color: #e2e8f0;
  font-family: monospace;
}
.ip-input:focus { outline: none; border-color: #4a6fa5; }

.row-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
.row-actions .link-btn { align-self: center; margin-right: auto; }

.btn-primary {
  background: #4a6fa5; color: #f1f5f9; border: none;
  padding: 8px 18px; border-radius: 8px; font-size: 0.85rem; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.btn-primary:hover:not(:disabled) { background: #5b80b8; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.link-prompt { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
.link-icon { font-size: 3rem; animation: pulse 1.4s ease-in-out infinite; }
.link-prompt h3 { margin: 4px 0; color: #e2e8f0; font-size: 1rem; font-weight: 600; }
.link-prompt p { margin: 0; color: #94a3b8; font-size: 0.85rem; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }

.countdown {
  margin-top: 14px; font-size: 1.2rem; font-weight: 700; color: #93c5fd;
  font-variant-numeric: tabular-nums;
}

.success-icon {
  width: 48px; height: 48px; border-radius: 50%;
  background: rgba(34, 197, 94, 0.15); color: #86efac;
  font-size: 1.6rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center; align-self: center;
}

.error-icon {
  width: 48px; height: 48px; border-radius: 50%;
  background: rgba(239, 68, 68, 0.15); color: #fca5a5;
  font-size: 1.4rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center; align-self: center;
}

.error-msg { margin: 0; color: #fca5a5; font-size: 0.9rem; text-align: center; }
</style>
