'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CheckCircleIcon,
  EyeSlashIcon,
  PaintBrushIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/20/solid'
import type { SensorView } from '@/lib/shared/types'
import { Badge } from '@/app/components/badge'
import { useLongPress } from '@/lib/hooks/use-long-press'
import { ConfirmDialog } from './confirm-dialog'
import { TileMenu, type TileMenuHandle, type TileMenuItem } from './tile-menu'

function briFromHue(b: number): number {
  return Math.round((b / 254) * 100)
}

export function HueLightTile({
  sensor,
  colorOverride,
  selected,
  selectionMode,
  onEditSensor,
  onRemoveSensor,
  onHideSensor,
  onToggleSelect,
  onStartSelect,
  onToggled,
}: {
  sensor: SensorView
  /** Hex color the user picked in EditLightModal this session. Painted on the
   *  bulb-icon background when the light is on so the tile reflects the
   *  light's color choice. Falls back to bg-accent-soft when undefined. */
  colorOverride?: string
  /** True when the tile is checked in the room's multi-select grouping flow. */
  selected?: boolean
  /** True when the room is in multi-select mode. Tile primary tap toggles
   *  selection instead of toggling the bulb; bulb button is disabled. */
  selectionMode?: boolean
  onEditSensor: (sensorId: number) => void
  onRemoveSensor: (sensorId: number) => void
  onHideSensor?: (sensorId: number) => void
  onToggleSelect?: (sensorId: number) => void
  onStartSelect?: (sensorId: number) => void
  onToggled: () => void
}) {
  const [localOn, setLocalOn] = useState<boolean>(sensor.lightOn ?? false)
  const [localBri, setLocalBri] = useState<number>(briFromHue(sensor.lightBrightness ?? 0))
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmHide, setConfirmHide] = useState(false)

  const menuRef = useRef<TileMenuHandle>(null)
  const { handlers: pressHandlers, wasLongPressRef } = useLongPress(() => {
    if (onStartSelect) onStartSelect(sensor.id)
    else menuRef.current?.open()
  })

  // Reconcile from props when not pending or dragging.
  useEffect(() => {
    if (!pending) setLocalOn(sensor.lightOn ?? false)
  }, [sensor.lightOn, pending])
  useEffect(() => {
    if (!dragging && !pending) setLocalBri(briFromHue(sensor.lightBrightness ?? 0))
  }, [sensor.lightBrightness, dragging, pending])

  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSentBri = useRef<number>(-1)

  function deviceUrl() {
    return `/api/integrations/hue/lights/${encodeURIComponent(sensor.deviceId ?? '')}/state`
  }

  async function postState(body: { on?: boolean; brightness?: number }) {
    const res = await fetch(deviceUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      let payload: { data?: { error?: string }; message?: string } = {}
      try { payload = await res.json() } catch {}
      throw payload
    }
  }

  async function toggleOn() {
    if (!sensor.deviceId) return
    const next = !localOn
    const prev = localOn
    setLocalOn(next)
    setPending(true)
    setError(null)
    try {
      await postState({ on: next })
      onToggled()
    } catch (err: unknown) {
      setLocalOn(prev)
      const e = err as { data?: { error?: string }; message?: string }
      setError(e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed'))
    } finally {
      setPending(false)
    }
  }

  async function sendBrightness(value: number) {
    if (!sensor.deviceId) return
    if (value === lastSentBri.current) return
    lastSentBri.current = value
    setError(null)
    try {
      const body: { brightness: number; on?: boolean } = { brightness: value }
      if (value > 0 && !localOn) { body.on = true; setLocalOn(true) }
      await postState(body)
      onToggled()
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string }
      setError(e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed'))
    }
  }

  function onBrightnessInput(e: React.ChangeEvent<HTMLInputElement>) {
    const value = Number(e.target.value)
    setLocalBri(value)
    setDragging(true)
    if (throttleTimer.current !== null) return
    throttleTimer.current = setTimeout(() => {
      throttleTimer.current = null
      sendBrightness(value)
    }, 120)
  }

  async function commitBrightness() {
    setDragging(false)
    if (throttleTimer.current) {
      clearTimeout(throttleTimer.current)
      throttleTimer.current = null
    }
    setPending(true)
    try {
      await sendBrightness(localBri)
    } finally {
      setPending(false)
    }
  }

  useEffect(() => {
    return () => {
      if (throttleTimer.current) clearTimeout(throttleTimer.current)
    }
  }, [])

  const reachable = sensor.lightReachable !== false
  const hasBrightness = sensor.capabilities?.brightness === true
  const displayName = sensor.label?.trim() || sensor.hueName?.trim() || 'Light'

  function tap() {
    if (wasLongPressRef.current) return
    if (selectionMode && onToggleSelect) onToggleSelect(sensor.id)
  }

  const items: TileMenuItem[] = [
    {
      key: 'edit',
      label: 'Edit',
      icon: <PaintBrushIcon data-slot="icon" />,
      // EditLightModal already covers both rename and color in one dialog.
      onSelect: () => onEditSensor(sensor.id),
    },
    ...(onStartSelect ? [{
      key: 'select',
      label: sensor.groupId ? 'Edit group members' : 'Select to group',
      icon: <PencilSquareIcon data-slot="icon" />,
      onSelect: () => onStartSelect(sensor.id),
    }] : []),
    ...(onHideSensor ? [{
      key: 'hide',
      label: 'Hide',
      icon: <EyeSlashIcon data-slot="icon" />,
      tone: 'warning' as const,
      onSelect: () => setConfirmHide(true),
    }] : []),
    {
      key: 'remove',
      label: 'Remove from room',
      icon: <TrashIcon data-slot="icon" />,
      tone: 'destructive',
      onSelect: () => setConfirmRemove(true),
    },
  ]

  return (
    <div
      role={selectionMode ? 'button' : undefined}
      tabIndex={selectionMode ? 0 : undefined}
      onClick={selectionMode ? tap : undefined}
      onKeyDown={selectionMode ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap() }
      } : undefined}
      style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
      data-selected={selected ? 'true' : undefined}
      {...pressHandlers}
      className={[
        'group/tile relative flex flex-col items-center gap-3 rounded-2xl p-4 ring-1 transition',
        !reachable
          ? 'bg-error/[0.04] ring-error/30'
          : selected
            ? 'bg-accent-soft ring-2 ring-accent dark:bg-accent/15'
            : 'bg-surface ring-default hover:bg-surface-2 dark:ring-white/10 dark:hover:bg-white/[0.02]',
        selectionMode ? 'cursor-pointer' : '',
      ].join(' ')}
    >
      <button
        type="button"
        disabled={pending || !reachable || selectionMode}
        title={localOn ? 'Turn off' : 'Turn on'}
        onClick={(e) => { e.stopPropagation(); if (!selectionMode) toggleOn() }}
        // When on AND the user has picked a color in EditLightModal this
        // session, paint the bulb background with that color so the tile
        // reflects the light's actual color choice — same treatment as
        // LightGroupDetailRow uses for in-group bulbs.
        style={
          localOn && reachable && colorOverride
            ? {
                backgroundColor: colorOverride,
                boxShadow: `0 4px 12px -2px ${colorOverride}80, inset 0 0 0 1px ${colorOverride}`,
              }
            : undefined
        }
        className={[
          'relative flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          localOn && reachable
            ? colorOverride
              ? 'text-white'
              : 'bg-accent-soft text-accent-strong ring-1 ring-accent/30 dark:bg-accent/15 dark:ring-accent/30'
            : 'bg-surface ring-1 ring-default',
          pending || !reachable ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      >
        <span className={`transition ${!localOn ? 'grayscale opacity-50' : ''}`}>💡</span>
      </button>

      <div className="flex flex-col items-center gap-0.5 w-full min-w-0 text-center">
        <span className="text-sm font-semibold text-text truncate max-w-full" title={displayName}>{displayName}</span>
        <span className={`text-[0.7rem] font-medium uppercase tracking-wider ${localOn && reachable ? 'text-accent-strong' : 'text-subtle'}`}>
          {localOn ? 'On' : 'Off'}
        </span>
      </div>

      {hasBrightness && !selectionMode && (
        <input
          type="range" min={0} max={100} step={1}
          value={localBri}
          disabled={!reachable || !localOn}
          title={`Brightness ${localBri}%`}
          className="slider slider-sm w-full"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={() => setDragging(true)}
          onTouchStart={() => setDragging(true)}
          onChange={onBrightnessInput}
          onMouseUp={commitBrightness}
          onTouchEnd={commitBrightness}
        />
      )}

      {!reachable && <Badge color="red">Unreachable</Badge>}
      {error && (
        <span
          className="absolute top-1.5 left-1.5 inline-flex size-4 items-center justify-center rounded-full bg-error text-[0.6rem] font-bold text-white"
          title={error}
        >!</span>
      )}

      {selected && (
        <CheckCircleIcon
          aria-hidden
          className="absolute top-1.5 left-1.5 size-5 rounded-full bg-surface text-accent shadow-sm dark:bg-surface-2"
        />
      )}

      <TileMenu ref={menuRef} items={items} />

      <ConfirmDialog
        open={confirmRemove}
        message="Remove this light from the room? It will return to discovered devices."
        confirmLabel="Remove"
        onConfirm={() => { onRemoveSensor(sensor.id); setConfirmRemove(false) }}
        onCancel={() => setConfirmRemove(false)}
      />
      <ConfirmDialog
        open={confirmHide}
        title="Hide this light?"
        message="Hidden lights won't appear in discovery. You can unhide from /lights."
        confirmLabel="Hide"
        tone="default"
        onConfirm={() => { onHideSensor?.(sensor.id); setConfirmHide(false) }}
        onCancel={() => setConfirmHide(false)}
      />
    </div>
  )
}
