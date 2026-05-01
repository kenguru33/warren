'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Badge } from '@/app/components/badge'
import { ConfirmDialog } from '@/app/components/warren/confirm-dialog'
import { HuePairingModal } from '@/app/components/warren/hue-pairing-modal'

const TONE_COLOR = {
  ok: 'green',
  warn: 'amber',
  err: 'red',
  info: 'blue',
  neutral: 'zinc',
} as const

interface HueStatus {
  connected: boolean
  bridge: { id: string; name: string | null; model: string | null; ip: string } | null
  lastSyncAt: number | null
  lastStatus: string | null
  lastStatusAt?: number | null
  counts: { lights: number; sensors: number }
}

const DEFAULT_STATUS: HueStatus = {
  connected: false, bridge: null, lastSyncAt: null, lastStatus: null,
  counts: { lights: 0, sensors: 0 },
}

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json())

function fmtTime(ms: number | null) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString()
}

export default function HueIntegrationPage() {
  const { data: status = DEFAULT_STATUS, mutate: refresh } = useSWR<HueStatus>(
    '/api/integrations/hue/status', fetcher, { refreshInterval: 15_000 },
  )

  const [showPairing, setShowPairing] = useState(false)
  const [showDisconnect, setShowDisconnect] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  async function onPaired() {
    setShowPairing(false)
    await refresh()
  }

  async function disconnect() {
    await fetch('/api/integrations/hue', { method: 'DELETE', credentials: 'include' })
    setShowDisconnect(false)
    await refresh()
  }

  async function syncNow() {
    setSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch('/api/integrations/hue/sync', { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        let payload: { data?: { message?: string }; message?: string } = {}
        try { payload = await res.json() } catch {}
        throw payload
      }
      await refresh()
    } catch (err: unknown) {
      const e = err as { data?: { message?: string }; message?: string }
      setSyncError(e.data?.message ?? e.message ?? 'sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const statusBadge = (() => {
    const s = status?.lastStatus
    if (s === 'connected') return { text: 'Connected', tone: 'ok' as const }
    if (s === 'unreachable') return { text: 'Unreachable', tone: 'warn' as const }
    if (s === 'unauthorized') return { text: 'Unauthorized — re-pair required', tone: 'err' as const }
    if (s === 'pairing') return { text: 'Pairing…', tone: 'info' as const }
    return { text: 'Not connected', tone: 'neutral' as const }
  })()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">Philips Hue</h1>
        <p className="mt-1 text-sm/6 text-muted">Connect a Hue Bridge to bring its lights and sensors into Warren.</p>
      </div>

      <section className="rounded-xl bg-surface ring-1 ring-default shadow-sm dark:ring-white/10 dark:shadow-none overflow-hidden">
        {!status?.bridge ? (
          <div className="px-8 py-12 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft ring-1 ring-accent/20">
              <span className="text-3xl">💡</span>
            </div>
            <h2 className="mt-4 text-base/6 font-semibold text-text">No Hue Bridge connected</h2>
            <p className="mt-1 text-sm/6 text-muted max-w-md mx-auto">
              Discover the bridge on your network or enter its IP address manually.
            </p>
            <div className="mt-6">
              <button type="button" className="btn-primary" onClick={() => setShowPairing(true)}>
                Connect Hue Bridge
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-4 px-6 py-5 border-b border-default">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft ring-1 ring-accent/20 text-2xl">💡</div>
              <div className="flex-1 min-w-0">
                <div className="text-base/6 font-semibold text-text truncate">{status.bridge.name ?? 'Hue Bridge'}</div>
                <div className="text-xs text-subtle mt-0.5 truncate">
                  {status.bridge.ip} · {status.bridge.model || 'unknown model'} · ID {status.bridge.id}
                </div>
              </div>
              <Badge color={TONE_COLOR[statusBadge.tone]}>
                {statusBadge.text}
              </Badge>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-default">
              <div className="px-6 py-5 bg-surface">
                <dt className="text-xs font-medium text-subtle uppercase tracking-wider">Lights</dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-text tabular-nums">{status.counts.lights}</dd>
              </div>
              <div className="px-6 py-5 bg-surface">
                <dt className="text-xs font-medium text-subtle uppercase tracking-wider">Sensors</dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-text tabular-nums">{status.counts.sensors}</dd>
              </div>
              <div className="px-6 py-5 bg-surface">
                <dt className="text-xs font-medium text-subtle uppercase tracking-wider">Last sync</dt>
                <dd className="mt-1 text-sm text-text">{fmtTime(status.lastSyncAt)}</dd>
              </div>
            </dl>

            {syncError && (
              <div className="mx-6 mt-5 rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-sm text-error">
                {syncError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-default bg-surface-2/50">
              <button type="button" className="btn-secondary" disabled={syncing} onClick={syncNow}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <button type="button" className="btn-danger" onClick={() => setShowDisconnect(true)}>
                Disconnect
              </button>
            </div>
          </div>
        )}
      </section>

      <HuePairingModal
        open={showPairing}
        onPaired={onPaired}
        onCancel={() => setShowPairing(false)}
      />
      <ConfirmDialog
        open={showDisconnect}
        title="Disconnect Hue Bridge?"
        message="Hue lights and sensors will be removed from rooms. Historical sensor data is kept."
        confirmLabel="Disconnect"
        onConfirm={disconnect}
        onCancel={() => setShowDisconnect(false)}
      />
    </div>
  )
}
