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
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight text-text">Philips Hue</h1>
      <p class="mt-1 text-sm/6 text-muted">Connect a Hue Bridge to bring its lights and sensors into Warren.</p>
    </div>

    <section class="card overflow-hidden">
      <div v-if="!status?.bridge" class="px-8 py-12 text-center">
        <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft ring-1 ring-accent/20">
          <span class="text-3xl">💡</span>
        </div>
        <h2 class="mt-4 text-base/6 font-semibold text-text">No Hue Bridge connected</h2>
        <p class="mt-1 text-sm/6 text-muted max-w-md mx-auto">Discover the bridge on your network or enter its IP address manually.</p>
        <div class="mt-6">
          <button class="btn-primary" @click="showPairing = true">Connect Hue Bridge</button>
        </div>
      </div>

      <div v-else>
        <div class="flex items-center gap-4 px-6 py-5 border-b border-default">
          <div class="flex size-12 items-center justify-center rounded-2xl bg-accent-soft ring-1 ring-accent/20 text-2xl">💡</div>
          <div class="flex-1 min-w-0">
            <div class="text-base/6 font-semibold text-text truncate">{{ status.bridge.name ?? 'Hue Bridge' }}</div>
            <div class="text-xs text-subtle mt-0.5 truncate">{{ status.bridge.ip }} · {{ status.bridge.model || 'unknown model' }} · ID {{ status.bridge.id }}</div>
          </div>
          <span
            :class="[
              'badge',
              statusBadge.tone === 'ok' && 'badge-success',
              statusBadge.tone === 'warn' && 'badge-warning',
              statusBadge.tone === 'err' && 'badge-error',
              statusBadge.tone === 'info' && 'badge-accent',
              statusBadge.tone === 'neutral' && 'badge-neutral',
            ]"
          >{{ statusBadge.text }}</span>
        </div>

        <dl class="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-default">
          <div class="px-6 py-5 bg-surface">
            <dt class="text-xs font-medium text-subtle uppercase tracking-wider">Lights</dt>
            <dd class="mt-1 text-3xl font-semibold tracking-tight text-text tabular-nums">{{ status.counts.lights }}</dd>
          </div>
          <div class="px-6 py-5 bg-surface">
            <dt class="text-xs font-medium text-subtle uppercase tracking-wider">Sensors</dt>
            <dd class="mt-1 text-3xl font-semibold tracking-tight text-text tabular-nums">{{ status.counts.sensors }}</dd>
          </div>
          <div class="px-6 py-5 bg-surface">
            <dt class="text-xs font-medium text-subtle uppercase tracking-wider">Last sync</dt>
            <dd class="mt-1 text-sm text-text">{{ fmtTime(status.lastSyncAt) }}</dd>
          </div>
        </dl>

        <div v-if="syncError" class="mx-6 mt-5 rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-sm text-error">{{ syncError }}</div>

        <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-default bg-surface-2/50">
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
      title="Disconnect Hue Bridge?"
      message="Hue lights and sensors will be removed from rooms. Historical sensor data is kept."
      confirm-label="Disconnect"
      @confirm="disconnect"
      @cancel="showDisconnect = false"
    />
  </div>
</template>
