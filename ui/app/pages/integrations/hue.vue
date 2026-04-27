<script setup lang="ts">
interface HueStatus {
  connected: boolean
  bridge: { id: string; name: string | null; model: string | null; ip: string } | null
  lastSyncAt: number | null
  lastStatus: string | null
  lastStatusAt?: number | null
  counts: { lights: number; sensors: number }
}

const { data: status, refresh } = await useFetch<HueStatus>('/api/integrations/hue/status', {
  default: () => ({ connected: false, bridge: null, lastSyncAt: null, lastStatus: null, counts: { lights: 0, sensors: 0 } }),
})

const showPairing = ref(false)
const showDisconnect = ref(false)
const syncing = ref(false)
const syncError = ref<string | null>(null)

function fmtTime(ms: number | null) {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.toLocaleString()
}

async function onPaired() {
  showPairing.value = false
  await refresh()
}

async function disconnect() {
  await $fetch('/api/integrations/hue', { method: 'DELETE' })
  showDisconnect.value = false
  await refresh()
}

async function syncNow() {
  syncing.value = true
  syncError.value = null
  try {
    await $fetch('/api/integrations/hue/sync', { method: 'POST' })
    await refresh()
  } catch (err: unknown) {
    const e = err as { data?: { message?: string }; message?: string }
    syncError.value = e.data?.message ?? e.message ?? 'sync failed'
  } finally {
    syncing.value = false
  }
}

const statusBadge = computed(() => {
  const s = status.value?.lastStatus
  if (s === 'connected') return { text: 'Connected', tone: 'ok' }
  if (s === 'unreachable') return { text: 'Unreachable', tone: 'warn' }
  if (s === 'unauthorized') return { text: 'Unauthorized — re-pair required', tone: 'err' }
  if (s === 'pairing') return { text: 'Pairing…', tone: 'info' }
  return { text: 'Not connected', tone: 'neutral' }
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h1>Philips Hue</h1>
      <p class="subtitle">Connect a Hue Bridge to bring its lights and sensors into Warren.</p>
    </header>

    <section class="card">
      <div v-if="!status?.bridge" class="empty">
        <div class="bulb">💡</div>
        <h2>No Hue Bridge connected</h2>
        <p>Discover the bridge on your network or enter its IP address manually.</p>
        <button class="btn-primary" @click="showPairing = true">Connect Hue Bridge</button>
      </div>

      <div v-else class="connected">
        <div class="bridge-row">
          <div class="bridge-icon">💡</div>
          <div class="bridge-meta">
            <div class="bridge-name">{{ status.bridge.name ?? 'Hue Bridge' }}</div>
            <div class="bridge-detail">{{ status.bridge.ip }} · {{ status.bridge.model || 'unknown model' }}</div>
            <div class="bridge-detail">ID {{ status.bridge.id }}</div>
          </div>
          <span class="badge" :class="`badge-${statusBadge.tone}`">{{ statusBadge.text }}</span>
        </div>

        <div class="metrics">
          <div class="metric">
            <div class="metric-value">{{ status.counts.lights }}</div>
            <div class="metric-label">Lights</div>
          </div>
          <div class="metric">
            <div class="metric-value">{{ status.counts.sensors }}</div>
            <div class="metric-label">Sensors</div>
          </div>
          <div class="metric">
            <div class="metric-value small">{{ fmtTime(status.lastSyncAt) }}</div>
            <div class="metric-label">Last sync</div>
          </div>
        </div>

        <div v-if="syncError" class="error-banner">{{ syncError }}</div>

        <div class="actions">
          <button class="btn-secondary" :disabled="syncing" @click="syncNow">
            {{ syncing ? 'Syncing…' : 'Sync now' }}
          </button>
          <button class="btn-danger" @click="showDisconnect = true">Disconnect</button>
        </div>
      </div>
    </section>

    <HuePairingModal v-if="showPairing" @paired="onPaired" @cancel="showPairing = false" />
    <ConfirmDialog
      v-if="showDisconnect"
      message="Disconnect the Hue Bridge? Hue lights and sensors will be removed from rooms. Historical sensor data is kept."
      confirm-label="Disconnect"
      @confirm="disconnect"
      @cancel="showDisconnect = false"
    />
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 24px; }

.page-header h1 { margin: 0 0 4px 0; font-size: 1.6rem; font-weight: 700; color: #e2e8f0; }
.subtitle { margin: 0; color: #94a3b8; font-size: 0.9rem; }

.card {
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 12px;
  padding: 28px;
}

.empty {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 24px 0;
}
.empty .bulb { font-size: 3rem; }
.empty h2 { margin: 0; color: #e2e8f0; font-size: 1.2rem; font-weight: 600; }
.empty p { margin: 0 0 12px 0; color: #94a3b8; font-size: 0.9rem; text-align: center; }

.btn-primary {
  background: #4a6fa5; color: #f1f5f9; border: none;
  padding: 10px 20px; border-radius: 8px; font-size: 0.9rem; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.btn-primary:hover { background: #5b80b8; }

.btn-secondary {
  background: #2a2f45; color: #e2e8f0; border: 1px solid #3b4263;
  padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.btn-secondary:hover:not(:disabled) { background: #3b4263; }
.btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-danger {
  background: #7f1d1d; color: #fca5a5; border: none;
  padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.btn-danger:hover { background: #991b1b; color: #fecaca; }

.connected { display: flex; flex-direction: column; gap: 20px; }

.bridge-row { display: flex; align-items: center; gap: 16px; }
.bridge-icon { font-size: 2.4rem; }
.bridge-meta { flex: 1; }
.bridge-name { color: #e2e8f0; font-weight: 600; font-size: 1rem; }
.bridge-detail { color: #94a3b8; font-size: 0.8rem; margin-top: 2px; }

.badge {
  padding: 4px 10px; border-radius: 999px;
  font-size: 0.72rem; font-weight: 600;
}
.badge-ok { background: rgba(34, 197, 94, 0.15); color: #86efac; }
.badge-warn { background: rgba(234, 179, 8, 0.15); color: #fde68a; }
.badge-err { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
.badge-info { background: rgba(74, 111, 165, 0.2); color: #93c5fd; }
.badge-neutral { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }

.metrics { display: flex; gap: 24px; }
.metric { flex: 1; padding: 16px; background: #161a26; border-radius: 8px; }
.metric-value { font-size: 1.5rem; font-weight: 700; color: #e2e8f0; }
.metric-value.small { font-size: 0.85rem; font-weight: 500; color: #94a3b8; }
.metric-label { color: #64748b; font-size: 0.75rem; margin-top: 4px; }

.actions { display: flex; gap: 8px; justify-content: flex-end; }

.error-banner {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  padding: 10px 14px; border-radius: 8px; font-size: 0.85rem;
}
</style>
