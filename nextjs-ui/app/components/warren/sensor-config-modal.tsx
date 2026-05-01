'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/app/components/badge'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/app/components/dialog'
import {
  Description,
  Field,
  FieldGroup,
  Fieldset,
  Label,
} from '@/app/components/fieldset'
import { Input } from '@/app/components/input'

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
    <Dialog open={open} onClose={onClose} size="lg">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-accent-soft ring-1 ring-accent/20 text-xl">⚙️</div>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate">{label || 'Temperature sensor'}</DialogTitle>
          <div className="text-xs text-subtle font-mono mt-0.5 truncate">{deviceId}</div>
        </div>
        {pending ? (
          <Badge color="amber">Pending sync</Badge>
        ) : lastFetchedAt ? (
          <Badge color="green">Synced</Badge>
        ) : null}
      </div>

      <DialogBody>
        {loading ? (
          <div className="text-center py-6 text-sm text-subtle">Loading…</div>
        ) : fetchError ? (
          <div className="rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-sm text-error">{fetchError}</div>
        ) : (
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>Target temperature (°C)</Label>
                <Input
                  type="number"
                  step={0.5}
                  value={form.refTemp ?? ''}
                  onChange={e => patch({ refTemp: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="Use room reference"
                />
                <Description>Leave blank to fall back to the room reference.</Description>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <Label>Heater ON offset</Label>
                  <Input
                    type="number" step={0.5} min={0}
                    value={form.heaterOnOffset}
                    onChange={e => patch({ heaterOnOffset: Number(e.target.value) })}
                  />
                  <Description>°C below target.</Description>
                </Field>
                <Field>
                  <Label>Heater OFF offset</Label>
                  <Input
                    type="number" step={0.5} min={0}
                    value={form.heaterOffOffset}
                    onChange={e => patch({ heaterOffOffset: Number(e.target.value) })}
                  />
                  <Description>°C above target.</Description>
                </Field>
              </div>

              <Field>
                <Label>Fan threshold</Label>
                <Input
                  type="number" step={0.5} min={0}
                  value={form.fanThreshold}
                  onChange={e => patch({ fanThreshold: Number(e.target.value) })}
                />
                <Description>°C above target before the fan runs.</Description>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <Label>Sensor poll interval</Label>
                  <Input
                    type="number" step={1} min={1}
                    value={form.pollInterval}
                    onChange={e => patch({ pollInterval: Number(e.target.value) })}
                  />
                  <Description>Seconds.</Description>
                </Field>
                <Field>
                  <Label>Config fetch interval</Label>
                  <Input
                    type="number" step={1} min={10}
                    value={form.configFetchInterval}
                    onChange={e => patch({ configFetchInterval: Number(e.target.value) })}
                  />
                  <Description>Seconds.</Description>
                </Field>
              </div>
            </FieldGroup>
          </Fieldset>
        )}
      </DialogBody>

      {!loading && !fetchError && (
        <DialogActions>
          <Button plain type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  )
}
