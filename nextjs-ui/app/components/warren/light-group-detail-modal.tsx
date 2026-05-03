'use client'

import { useEffect, useMemo, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/20/solid'
import type { LightGroupView, SensorView } from '@/lib/shared/types'
import { LIGHT_THEMES, type LightThemeKey } from '@/lib/shared/light-themes'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogBody,
  DialogTitle,
} from '@/app/components/dialog'
import { Field, Label } from '@/app/components/fieldset'
import { LightThemePicker } from './light-theme-picker'
import { LightGroupDetailRow } from './light-group-detail-row'

export function LightGroupDetailModal({
  open,
  group,
  members,
  colorOverrides,
  onClose,
  onToggled,
  onEditSensor,
  onClearColorOverrides,
}: {
  open: boolean
  group: LightGroupView | null
  members: SensorView[]
  /** Per-sensor color override, populated after a custom color is applied via
   *  EditLightModal. Wins over the round-robin theme palette color. */
  colorOverrides?: Record<number, string>
  onClose: () => void
  onToggled: () => void
  onEditSensor: (sensorId: number) => void
  /** After a successful theme change the bridge repaints every member with
   *  the new palette, so previously stored color picks become stale. The
   *  dashboard implements this to drop those keys from its override map. */
  onClearColorOverrides?: (sensorIds: number[]) => void
}) {
  const [localTheme, setLocalTheme] = useState<LightThemeKey | null>(group?.theme ?? null)
  const [themeError, setThemeError] = useState<string | null>(null)

  useEffect(() => {
    setLocalTheme(group?.theme ?? null)
    setThemeError(null)
  }, [group?.id, group?.theme])

  const sortedMembers = useMemo(() => (
    [...members].sort((a, b) => {
      const an = (a.label?.trim() || a.hueName?.trim() || '').toLowerCase()
      const bn = (b.label?.trim() || b.hueName?.trim() || '').toLowerCase()
      return an.localeCompare(bn)
    })
  ), [members])

  if (!group) return null

  const stateLabel = (() => {
    const onCount = members.filter(m => m.lightOn === true && m.lightReachable !== false).length
    const total = members.filter(m => m.lightReachable !== false).length
    if (group.state === 'mixed') return `${onCount} of ${total} on`
    if (group.state === 'all-on') return total === 1 ? 'On' : 'All on'
    return total === 0 ? 'Offline' : 'All off'
  })()
  const memberLabel = `${group.memberCount} ${group.memberCount === 1 ? 'light' : 'lights'}`

  async function onThemeChange(key: LightThemeKey) {
    if (key === localTheme) return
    const prev = localTheme
    setLocalTheme(key)
    setThemeError(null)
    try {
      const res = await fetch(`/api/light-groups/${group!.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ theme: key }),
      })
      if (!res.ok) {
        let payload: { data?: { error?: string }; message?: string } = {}
        try { payload = await res.json() } catch {}
        throw payload
      }
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string }
      setThemeError(e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'Failed to save theme'))
      setLocalTheme(prev)
      return
    }
    if (group!.state !== 'all-off') {
      // Fire-and-forget paint with the new theme.
      fetch(`/api/light-groups/${group!.id}/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ on: true, theme: key }),
      }).catch(() => {})
    }
    // Theme paint resets per-member colors, so previous EditLightModal picks
    // are stale — drop them so the new palette colors show in the row bulbs.
    onClearColorOverrides?.(members.map(m => m.id))
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <DialogTitle className="truncate">{group.name}</DialogTitle>
          <p className="mt-0.5 text-xs font-medium tracking-wider text-subtle uppercase">
            {stateLabel} · {memberLabel}
          </p>
        </div>
        <Button plain aria-label="Close" onClick={onClose}>
          <XMarkIcon data-slot="icon" />
        </Button>
      </div>

      <div className="mt-4">
        <Field>
          <Label>Theme</Label>
          <div className="mt-1.5">
            <LightThemePicker value={localTheme ?? group.theme} onChange={onThemeChange} />
          </div>
        </Field>
        {themeError && (
          <p className="mt-2 rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-xs text-error">{themeError}</p>
        )}
      </div>

      <DialogBody>
        {sortedMembers.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-subtle">No lights in this group.</p>
        ) : (
          <ul role="list" className="-m-2 flex max-h-[50vh] flex-col gap-2 overflow-y-auto p-2 pretty-scroll">
            {sortedMembers.map((m, i) => {
              const palette = LIGHT_THEMES[localTheme ?? group.theme]?.bulbPalette ?? []
              const override = colorOverrides?.[m.id]
              // Visualize the theme signature on every member's bulb in the row,
              // not just color-capable ones — hardware capability gates the
              // physical paint, but the UI consistently reflects "this is the
              // theme color slot for this light". Without this, on/off-only bulbs
              // fell through to bg-accent (the active app scheme) and broke the
              // visual story when the rest of the row was painted in palette
              // colors.
              const accentColor = override
                ?? (palette.length > 0 ? palette[i % palette.length] : undefined)
              return (
                <li key={m.id}>
                  <LightGroupDetailRow
                    sensor={m}
                    accentColor={accentColor}
                    onToggled={onToggled}
                    onEditSensor={onEditSensor}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </DialogBody>
    </Dialog>
  )
}
