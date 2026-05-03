'use client'

import { useEffect, useState } from 'react'
import { CheckIcon } from '@heroicons/react/20/solid'
import type { SensorView } from '@/lib/shared/types'
import type { LightThemeKey } from '@/lib/shared/light-themes'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/app/components/dialog'
import { Field, Label } from '@/app/components/fieldset'
import { LightColorPicker } from './light-color-picker'
import { LightThemePicker } from './light-theme-picker'

function PalettePicker({
  paletteColors,
  value,
  onChange,
}: {
  paletteColors: string[]
  value: string | null
  onChange: (hex: string) => void
}) {
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-7">
      {paletteColors.map(hex => {
        const selected = value?.toLowerCase() === hex.toLowerCase()
        return (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            title={hex}
            aria-label={hex}
            aria-pressed={selected}
            style={{ background: hex }}
            className={[
              'relative size-9 rounded-full ring-1 transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              selected
                ? 'ring-2 ring-accent ring-offset-2 ring-offset-modal'
                : 'ring-default dark:ring-white/15',
            ].join(' ')}
          >
            {selected && (
              <CheckIcon
                aria-hidden
                className="absolute inset-0 m-auto size-5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Color-only editor for a single light. Rename lives on its own menu item
 * and dialog (RenameDialog) — keeping this dialog focused on color matches
 * the dashboard's "one menu item names exactly one operation" rule.
 */
export function EditLightModal({
  open,
  sensor,
  paletteColors,
  groupName,
  currentColor,
  onClose,
  onColorApplied,
}: {
  open: boolean
  sensor: SensorView | null
  /** When the light belongs to a group, the active theme's bulbPalette. Restricts
   *  the color picker to those swatches only — no custom-color escape hatch. */
  paletteColors?: string[]
  /** Group name, used to label the constrained palette section. */
  groupName?: string
  /** Hex of the color this light currently displays — selects the matching
   *  swatch when the picker opens. */
  currentColor?: string
  onClose: () => void
  /** Fires after a color is successfully sent to the bridge so the caller can
   *  reflect the new color in adjacent UI (group detail list, etc.) without
   *  waiting for a full refetch. */
  onColorApplied?: (sensorId: number, hex: string) => void
}) {
  const [color, setColor] = useState<string | null>(null)
  const [theme, setTheme] = useState<LightThemeKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && sensor) {
      setColor(currentColor ?? null)
      setTheme(sensor.lightTheme ?? null)
      setError(null)
    }
  }, [open, sensor?.id, currentColor, sensor?.lightTheme])

  if (!sensor) return null

  const supportsColor = sensor.capabilities?.color === true
  const supportsColorTemp = sensor.capabilities?.colorTemp === true
  const themeCapable = supportsColor || supportsColorTemp
  const displayName = sensor.label?.trim() || sensor.hueName?.trim() || `Light #${sensor.id}`

  async function applyColor(hex: string) {
    setColor(hex)
    setTheme(null)  // custom color picks clear the persisted theme
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
      onColorApplied?.(sensor.id, hex)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set color')
    }
  }

  async function applyTheme(key: LightThemeKey) {
    if (key === theme) return
    setTheme(key)
    if (!sensor || !sensor.deviceId) return
    setError(null)
    try {
      const res = await fetch(`/api/integrations/hue/lights/${encodeURIComponent(sensor.deviceId)}/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ on: true, theme: key }),
      })
      if (!res.ok) {
        let payload: { data?: { error?: string }; message?: string } = {}
        try { payload = await res.json() } catch {}
        const e = payload as { data?: { error?: string }; message?: string }
        throw new Error(e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'Failed to set theme'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set theme')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="md">
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
        {themeCapable && (
          <Field>
            <Label>Theme</Label>
            <div className="mt-1.5">
              <LightThemePicker value={theme ?? 'everyday'} onChange={applyTheme} hideColors />
            </div>
          </Field>
        )}
        {supportsColor ? (
          paletteColors && paletteColors.length > 0 ? (
            <div>
              <p className="text-xs text-subtle">
                Colors from the {groupName ? <>&ldquo;{groupName}&rdquo; </> : null}group theme.
              </p>
              <div className="mt-3">
                <PalettePicker
                  paletteColors={paletteColors}
                  value={color}
                  onChange={applyColor}
                />
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-subtle">Pick a color from the palette to paint this light right away.</p>
              <div className="mt-3">
                <LightColorPicker value={color} onChange={applyColor} />
              </div>
            </div>
          )
        ) : (
          <p className="text-sm text-subtle">This light only supports on/off — no color or temperature controls.</p>
        )}

        {error && (
          <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error ring-1 ring-error/30">{error}</p>
        )}
      </DialogBody>

      <DialogActions>
        <Button type="button" onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}
