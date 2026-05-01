'use client'

import { FormEvent, useEffect, useState, type ChangeEvent } from 'react'
import type { SensorView } from '@/lib/shared/types'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/app/components/dialog'
import { Field, Label } from '@/app/components/fieldset'
import { Input } from '@/app/components/input'
import { LightColorPicker } from './light-color-picker'

function PalettePicker({
  paletteColors,
  value,
  onChange,
}: {
  paletteColors: string[]
  value: string | null
  onChange: (hex: string) => void
}) {
  function onCustomInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.value) onChange(e.target.value)
  }
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-7">
      {paletteColors.map(hex => (
        <button
          key={hex}
          type="button"
          onClick={() => onChange(hex)}
          title={hex}
          aria-label={hex}
          style={{ background: hex }}
          className={[
            'size-9 rounded-full ring-1 transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            value?.toLowerCase() === hex.toLowerCase()
              ? 'ring-2 ring-accent ring-offset-2 ring-offset-modal'
              : 'ring-default dark:ring-white/15',
          ].join(' ')}
        />
      ))}
      <label
        className="relative size-9 cursor-pointer overflow-hidden rounded-full ring-1 ring-default dark:ring-white/15"
        title="Custom color"
        aria-label="Custom color"
      >
        <input
          type="color"
          value={value ?? '#ffffff'}
          onChange={onCustomInput}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        <span className="absolute inset-0 bg-[conic-gradient(from_0deg,_#ef4444,_#f59e0b,_#eab308,_#22c55e,_#06b6d4,_#3b82f6,_#a855f7,_#ec4899,_#ef4444)]" />
      </label>
    </div>
  )
}

export function EditLightModal({
  open,
  sensor,
  paletteColors,
  groupName,
  onClose,
  onSaved,
}: {
  open: boolean
  sensor: SensorView | null
  /** When the light belongs to a group, the active theme's bulbPalette. Restricts
   *  the color picker to those swatches + a custom-color escape hatch. */
  paletteColors?: string[]
  /** Group name, used to label the constrained palette section. */
  groupName?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && sensor) {
      setLabel(sensor.label ?? '')
      setColor(null)
      setError(null)
      setSaving(false)
    }
  }, [open, sensor?.id])

  if (!sensor) return null

  const supportsColor = sensor.capabilities?.color === true
  const displayName = sensor.label?.trim() || sensor.hueName?.trim() || `Light #${sensor.id}`

  async function applyColor(hex: string) {
    setColor(hex)
    if (!sensor || !sensor.deviceId) return
    setError(null)
    try {
      const res = await fetch(`/api/integrations/hue/lights/${encodeURIComponent(sensor.deviceId)}/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ on: true, color: hex }),
      })
      if (!res.ok) {
        let payload: { data?: { error?: string }; message?: string } = {}
        try { payload = await res.json() } catch {}
        const e = payload as { data?: { error?: string }; message?: string }
        throw new Error(e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'Failed to set color'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set color')
    }
  }

  async function save(e?: FormEvent) {
    e?.preventDefault()
    if (!sensor) return
    setSaving(true)
    setError(null)
    try {
      const trimmed = label.trim()
      if (trimmed !== (sensor.label ?? '')) {
        const res = await fetch(`/api/sensors/${sensor.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ label: trimmed || null }),
        })
        if (!res.ok) throw new Error(`Save failed (${res.status})`)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <form onSubmit={save}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">💡</span>
          <div className="min-w-0">
            <DialogTitle className="truncate">{displayName}</DialogTitle>
            {sensor.deviceId && (
              <div className="mt-0.5 truncate font-mono text-xs text-subtle">{sensor.deviceId}</div>
            )}
          </div>
        </div>

        <DialogBody className="space-y-5">
          <Field>
            <Label htmlFor="light-label">Label</Label>
            <Input
              id="light-label"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={sensor.hueName ?? 'Custom label…'}
              maxLength={60}
              autoFocus
            />
          </Field>

          {supportsColor && (
            <div>
              <span className="block text-base/6 font-medium text-text select-none sm:text-sm/6">Color</span>
              {paletteColors && paletteColors.length > 0 ? (
                <>
                  <p className="mt-1 text-xs text-subtle">
                    Colors from the {groupName ? <>&ldquo;{groupName}&rdquo; </> : null}group theme. Pick custom for anything else.
                  </p>
                  <div className="mt-3">
                    <PalettePicker
                      paletteColors={paletteColors}
                      value={color}
                      onChange={applyColor}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs text-subtle">Pick a color from the palette to paint this light right away.</p>
                  <div className="mt-3">
                    <LightColorPicker value={color} onChange={applyColor} />
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error ring-1 ring-error/30">{error}</p>
          )}
        </DialogBody>

        <DialogActions>
          <Button plain type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
