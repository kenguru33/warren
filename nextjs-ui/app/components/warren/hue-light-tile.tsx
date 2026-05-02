'use client'

import { useEffect, useRef, useState } from 'react'
import { PencilSquareIcon, XMarkIcon } from '@heroicons/react/20/solid'
import type { SensorView } from '@/lib/shared/types'
import { Badge } from '@/app/components/badge'
import { Button } from '@/app/components/button'
import { ConfirmDialog } from './confirm-dialog'

function briFromHue(b: number): number {
  return Math.round((b / 254) * 100)
}

export function HueLightTile({
  sensor,
  editing,
  onEditSensor,
  onRemoveSensor,
  onToggled,
}: {
  sensor: SensorView
  editing: boolean
  onEditSensor: (sensorId: number) => void
  onRemoveSensor: (sensorId: number) => void
  onToggled: () => void
}) {
  const [localOn, setLocalOn] = useState<boolean>(sensor.lightOn ?? false)
  const [localBri, setLocalBri] = useState<number>(briFromHue(sensor.lightBrightness ?? 0))
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

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

  return (
    <div
      className={[
        'group/tile relative flex flex-col items-center gap-3 rounded-2xl px-4 pt-4 pb-3.5 ring-1 transition',
        !reachable
          ? 'bg-error/[0.04] ring-error/30'
          : 'bg-surface ring-default hover:bg-surface-2 dark:ring-white/10 dark:hover:bg-white/[0.02]',
      ].join(' ')}
    >
      <button
        type="button"
        disabled={pending || !reachable}
        title={localOn ? 'Turn off' : 'Turn on'}
        onClick={(e) => { e.stopPropagation(); toggleOn() }}
        className={[
          'relative flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          localOn && reachable
            ? 'bg-accent-soft text-accent-strong ring-1 ring-accent/30 dark:bg-accent/15 dark:ring-accent/30'
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

      {hasBrightness && (
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

      {editing && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-xl bg-surface/75 p-0.5 backdrop-blur-md transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/tile:opacity-100 dark:bg-surface/65">
          <Button plain title="Edit" aria-label="Edit" onClick={(e) => { e.stopPropagation(); onEditSensor(sensor.id) }}>
            <PencilSquareIcon data-slot="icon" />
          </Button>
          <Button plain title="Remove" aria-label="Remove" onClick={(e) => { e.stopPropagation(); setConfirmRemove(true) }}>
            <XMarkIcon data-slot="icon" />
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        message="Remove this light from the room? It will return to discovered devices."
        confirmLabel="Remove"
        onConfirm={() => { onRemoveSensor(sensor.id); setConfirmRemove(false) }}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  )
}
