'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/app/components/badge'
import { AppDialog } from './app-dialog'

interface ConfigPayload {
  refTemp: number | null
  heaterOnOffset: number
  heaterOffOffset: number
  fanThreshold: number
  pollInterval: number
  configFetchInterval: number
}

const DEFAULTS: ConfigPayload = {
  refTemp: null,
  heaterOnOffset: 2.0,
  heaterOffOffset: 2.0,
  fanThreshold: 10.0,
  pollInterval: 5,
  configFetchInterval: 60,
}

export function SensorConfigModal({
  open,
  deviceId,
  label,
  onClose,
}: {
  open: boolean
  deviceId: string
  label: string | null
  onClose: () => void
}) {
  const [form, setForm] = useState<ConfigPayload>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setFetchError(null)
    fetch(`/api/sensors/config/${encodeURIComponent(deviceId)}`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ConfigPayload & { updatedAt: string | null; lastFetchedAt: string | null }>
      })
      .then(data => {
        if (cancelled) return
        setForm({
          refTemp: data.refTemp,
          heaterOnOffset: data.heaterOnOffset,
          heaterOffOffset: data.heaterOffOffset,
          fanThreshold: data.fanThreshold,
          pollInterval: data.pollInterval,
          configFetchInterval: data.configFetchInterval,
        })
        setUpdatedAt(data.updatedAt)
        setLastFetchedAt(data.lastFetchedAt)
      })
      .catch(e => { if (!cancelled) setFetchError(e instanceof Error ? e.message : 'Failed to load config') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, deviceId])

  const pending = !!(updatedAt && lastFetchedAt && new Date(lastFetchedAt) < new Date(updatedAt))

  async function save() {
    setSaving(true)
    try {
      await fetch(`/api/sensors/config/${encodeURIComponent(deviceId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function patch(p: Partial<ConfigPayload>) {
    setForm(f => ({ ...f, ...p }))
  }

  return (
    <AppDialog open={open} onClose={onClose} maxWidthClass="max-w-lg">
      <div className="px-6 pt-5 pb-4 border-b border-default">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-accent-soft ring-1 ring-accent/20 text-xl">⚙️</div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base/6 font-semibold text-text truncate">{label || 'Temperature sensor'}</h3>
            <div className="text-xs text-subtle font-mono mt-0.5 truncate">{deviceId}</div>
          </div>
          {pending ? (
            <Badge color="amber">Pending sync</Badge>
          ) : lastFetchedAt ? (
            <Badge color="green">Synced</Badge>
          ) : null}
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {loading ? (
          <div className="text-center py-6 text-sm text-subtle">Loading…</div>
        ) : fetchError ? (
          <div className="rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-sm text-error">{fetchError}</div>
        ) : (
          <>
            <div>
              <label className="label">Target temperature (°C)</label>
              <input
                type="number"
                step={0.5}
                value={form.refTemp ?? ''}
                onChange={e => patch({ refTemp: e.target.value === '' ? null : Number(e.target.value) })}
                className="input mt-1.5"
                placeholder="Use room reference"
              />
              <p className="help-text">Leave blank to fall back to the room reference.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Heater ON offset</label>
                <input
                  type="number" step={0.5} min={0}
                  value={form.heaterOnOffset}
                  onChange={e => patch({ heaterOnOffset: Number(e.target.value) })}
                  className="input mt-1.5"
                />
                <p className="help-text">°C below target.</p>
              </div>
              <div>
                <label className="label">Heater OFF offset</label>
                <input
                  type="number" step={0.5} min={0}
                  value={form.heaterOffOffset}
                  onChange={e => patch({ heaterOffOffset: Number(e.target.value) })}
                  className="input mt-1.5"
                />
                <p className="help-text">°C above target.</p>
              </div>
            </div>

            <div>
              <label className="label">Fan threshold</label>
              <input
                type="number" step={0.5} min={0}
                value={form.fanThreshold}
                onChange={e => patch({ fanThreshold: Number(e.target.value) })}
                className="input mt-1.5"
              />
              <p className="help-text">°C above target before the fan runs.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Sensor poll interval</label>
                <input
                  type="number" step={1} min={1}
                  value={form.pollInterval}
                  onChange={e => patch({ pollInterval: Number(e.target.value) })}
                  className="input mt-1.5"
                />
                <p className="help-text">Seconds.</p>
              </div>
              <div>
                <label className="label">Config fetch interval</label>
                <input
                  type="number" step={1} min={10}
                  value={form.configFetchInterval}
                  onChange={e => patch({ configFetchInterval: Number(e.target.value) })}
                  className="input mt-1.5"
                />
                <p className="help-text">Seconds.</p>
              </div>
            </div>
          </>
        )}
      </div>

      {!loading && !fetchError && (
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-default bg-surface-2/50">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </AppDialog>
  )
}
