'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { PencilSquareIcon } from '@heroicons/react/20/solid'
import type { SensorView } from '@/lib/shared/types'
import { Button } from '@/app/components/button'

function briFromHue(b: number): number {
  return Math.round((b / 254) * 100)
}

export function LightGroupDetailRow({
  sensor,
  onToggled,
  onEditSensor,
}: {
  sensor: SensorView
  onToggled: () => void
  onEditSensor: (sensorId: number) => void
}) {
  const [localOn, setLocalOn] = useState<boolean>(sensor.lightOn ?? false)
  const [localBri, setLocalBri] = useState<number>(briFromHue(sensor.lightBrightness ?? 0))
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  function onBrightnessInput(e: ChangeEvent<HTMLInputElement>) {
    const value = Number(e.target.value)
    setDragging(true)
    setLocalBri(value)
    if (throttleTimer.current !== null) return
    throttleTimer.current = setTimeout(() => {
      throttleTimer.current = null
      sendBrightness(value)
    }, 140)
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

  useEffect(() => () => {
    if (throttleTimer.current) clearTimeout(throttleTimer.current)
  }, [])

  const reachable = sensor.lightReachable !== false
  const hasBrightness = sensor.capabilities?.brightness === true
  const displayName = sensor.label?.trim() || sensor.hueName?.trim() || `Light #${sensor.id}`

  return (
    <div
      className={[
        'grid grid-cols-[40px_minmax(0,1fr)_minmax(120px,220px)_auto] items-center gap-4 px-3 py-2.5 rounded-xl ring-1 transition-colors',
        !reachable
          ? 'bg-error/5 ring-error/25'
          : localOn
            ? 'bg-accent/10 ring-accent/30'
            : 'bg-surface-2/60 ring-default/70 dark:ring-white/5',
      ].join(' ')}
    >
      <button
        type="button"
        disabled={pending || !reachable}
        title={localOn ? 'Turn off' : 'Turn on'}
        onClick={toggleOn}
        className={[
          'flex size-9 items-center justify-center rounded-xl text-lg transition-all',
          localOn && reachable
            ? 'bg-accent text-white shadow-md shadow-accent/40 ring-1 ring-accent/50'
            : 'bg-surface ring-1 ring-default',
          pending || !reachable ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      >
        <span className={!(localOn && reachable) ? 'grayscale opacity-50' : ''}>💡</span>
      </button>

      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-semibold text-text truncate" title={displayName}>{displayName}</span>
        {error ? (
          <span className="text-xs text-error truncate">{error}</span>
        ) : (
          <span
            className={[
              'text-[0.7rem] font-medium uppercase tracking-wider truncate',
              !reachable ? 'text-error' : localOn ? 'text-warning' : 'text-subtle',
            ].join(' ')}
          >
            {!reachable ? 'Unreachable' : localOn ? 'On' : 'Off'}
          </span>
        )}
      </div>

      <div className="flex items-center justify-end">
        {hasBrightness ? (
          <input
            type="range" min={0} max={100} step={1}
            value={localBri}
            disabled={!reachable}
            title={`Brightness ${localBri}%`}
            className="slider slider-sm w-full"
            onMouseDown={() => setDragging(true)}
            onTouchStart={() => setDragging(true)}
            onChange={onBrightnessInput}
            onMouseUp={commitBrightness}
            onTouchEnd={commitBrightness}
          />
        ) : (
          <span className="w-full text-right text-xs italic text-subtle">on/off only</span>
        )}
      </div>

      <Button plain title="Edit light" aria-label="Edit light" onClick={(e) => { e.stopPropagation(); onEditSensor(sensor.id) }}>
        <PencilSquareIcon data-slot="icon" />
      </Button>
    </div>
  )
}
