'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/app/components/dialog'
import { AppSwitch } from './app-switch'

/**
 * Per-sensor climate target editor. Replaces the previous room-edit-mode panel
 * that rendered target sliders for both temperature and humidity at once.
 *
 * The parent maps `value`/`enabled` → API `refTemp`/`refHumidity`, preserving
 * the unchanged side via `onSaveSingleRef` (see `(dashboard)/page.tsx`).
 */
export function ClimateTargetDialog({
  open,
  variant,
  currentValue,
  currentEnabled,
  onSave,
  onClose,
}: {
  open: boolean
  variant: 'temperature' | 'humidity'
  currentValue: number | null
  currentEnabled: boolean
  onSave: (value: number | null) => void
  onClose: () => void
}) {
  const isTemp = variant === 'temperature'
  const min = isTemp ? 10 : 20
  const max = isTemp ? 30 : 80
  const step = isTemp ? 0.5 : 1
  const unit = isTemp ? '°C' : '%'
  const fallback = isTemp ? 21 : 50
  const title = isTemp ? 'Target temperature' : 'Target humidity'

  const [enabled, setEnabled] = useState(currentEnabled)
  const [value, setValue] = useState<number>(currentValue ?? fallback)

  // Reset when (re)opened so the dialog reflects the live reference state.
  useEffect(() => {
    if (open) {
      setEnabled(currentEnabled)
      setValue(currentValue ?? fallback)
    }
  }, [open, currentValue, currentEnabled, fallback])

  function save() {
    onSave(enabled ? value : null)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogBody>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm/6 font-medium text-text">Enable target</span>
          <AppSwitch checked={enabled} onChange={setEnabled} label="Enable target" />
        </div>
        {enabled && (
          <div className="mt-4 flex flex-col gap-1.5">
            <div className="text-2xl font-semibold tabular-nums text-text">{value}{unit}</div>
            <input
              type="range"
              min={min} max={max} step={step}
              value={value}
              onChange={e => setValue(Number(e.target.value))}
              className="slider"
            />
            <div className="flex justify-between text-[0.65rem] text-subtle">
              <span>{min}{unit}</span>
              <span>{Math.round((min + max) / 2)}{unit}</span>
              <span>{max}{unit}</span>
            </div>
          </div>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain type="button" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={save}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
