'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { PencilSquareIcon, XMarkIcon } from '@heroicons/react/20/solid'
import type { LightGroupView, LightGroupState, SensorView } from '@/lib/shared/types'
import { resolveLightTheme, MIXED_RING_DEFAULT } from '@/lib/shared/light-themes'
import { useTheme } from '@/lib/hooks/use-theme'
import { Badge } from '@/app/components/badge'
import { Button } from '@/app/components/button'
import { ConfirmDialog } from './confirm-dialog'

export function LightGroupTile({
  group,
  members,
  editing,
  onEditGroup,
  onUngroup,
  onOpenDetail,
  onToggled,
}: {
  group: LightGroupView
  members: SensorView[]
  editing: boolean
  onEditGroup: (groupId: number) => void
  onUngroup: (groupId: number) => void
  onOpenDetail: (groupId: number) => void
  onToggled: () => void
}) {
  const [confirmUngroup, setConfirmUngroup] = useState(false)
  const [localOn, setLocalOn] = useState<boolean | null>(null)
  const [localBri, setLocalBri] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partial, setPartial] = useState<{ ok: number; failed: number } | null>(null)

  // Reset optimistic state on group prop change.
  useEffect(() => {
    if (!pending) setLocalOn(null)
    if (!dragging && !pending) setLocalBri(null)
  }, [group])

  const displayState: LightGroupState = localOn === null ? group.state : (localOn ? 'all-on' : 'all-off')
  const isOn = displayState === 'all-on' || displayState === 'mixed'
  const displayBri = localBri ?? group.brightness ?? 0

  const stateLabel = useMemo(() => {
    const onCount = members.filter(m => m.lightOn === true && m.lightReachable !== false).length
    const total = members.filter(m => m.lightReachable !== false).length
    if (displayState === 'mixed') return `${onCount} of ${total} on`
    if (displayState === 'all-on') return total === 1 ? 'On' : 'All on'
    return total === 0 ? 'Offline' : 'All off'
  }, [members, displayState])

  const { theme: mode } = useTheme()
  const theme = resolveLightTheme(group.theme, mode)
  const themeVars = {
    '--theme-on-border':  theme.onBorder,
    '--theme-on-glow':    theme.onGlow,
    '--theme-on-bg':      theme.toggleOnBg,
    '--theme-bulb-tint':  theme.bulbTint,
    '--theme-mixed-ring': theme.mixedRingOverride ?? MIXED_RING_DEFAULT,
  } as CSSProperties

  const statusUrl = `/api/light-groups/${group.id}/state`

  async function postState(body: { on?: boolean; brightness?: number }) {
    const res = await fetch(statusUrl, {
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
    return await res.json() as { successCount: number; failureCount: number; total: number }
  }

  async function toggleMaster() {
    const next = displayState !== 'all-on'
    setLocalOn(next)
    setPending(true)
    setError(null)
    setPartial(null)
    try {
      const res = await postState({ on: next })
      if (res.failureCount > 0) setPartial({ ok: res.successCount, failed: res.failureCount })
      onToggled()
    } catch (err: unknown) {
      setLocalOn(null)
      const e = err as { data?: { error?: string }; message?: string }
      setError(e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed'))
    } finally {
      setPending(false)
    }
  }

  const briThrottleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSentBri = useRef<number>(-1)

  async function sendBrightness(value: number) {
    if (value === lastSentBri.current) return
    lastSentBri.current = value
    setError(null)
    setPartial(null)
    try {
      const body: { brightness: number; on?: boolean } = { brightness: value }
      if (value > 0 && displayState !== 'all-on') {
        body.on = true
        setLocalOn(true)
      }
      const res = await postState(body)
      if (res.failureCount > 0) setPartial({ ok: res.successCount, failed: res.failureCount })
      onToggled()
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string }
      setError(e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed'))
    }
  }

  function onBrightnessInput(e: React.ChangeEvent<HTMLInputElement>) {
    const value = Number(e.target.value)
    setDragging(true)
    setLocalBri(value)
    if (briThrottleTimer.current !== null) return
    briThrottleTimer.current = setTimeout(() => {
      briThrottleTimer.current = null
      sendBrightness(value)
    }, 140)
  }

  async function commitBrightness() {
    setDragging(false)
    if (briThrottleTimer.current) {
      clearTimeout(briThrottleTimer.current)
      briThrottleTimer.current = null
    }
    if (localBri === null) return
    setPending(true)
    try {
      await sendBrightness(localBri)
    } finally {
      setPending(false)
    }
  }

  useEffect(() => () => {
    if (briThrottleTimer.current) clearTimeout(briThrottleTimer.current)
  }, [])

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpenDetail(group.id)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      style={themeVars}
      onClick={() => onOpenDetail(group.id)}
      onKeyDown={handleKey}
      className={[
        'group/tile relative flex flex-col items-center gap-3 rounded-2xl p-4 ring-1 transition cursor-pointer',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-on-border)]',
        displayState === 'mixed'
          ? 'bg-surface ring-warning/60 hover:bg-surface-2 dark:ring-warning/40 dark:hover:bg-white/[0.02]'
          : 'bg-surface ring-default hover:bg-surface-2 dark:ring-white/10 dark:hover:bg-white/[0.02]',
      ].join(' ')}
    >
      <button
        type="button"
        disabled={pending || group.memberCount === 0}
        title={isOn ? 'Turn group off' : 'Turn group on'}
        onClick={(e) => { e.stopPropagation(); toggleMaster() }}
        className={[
          'relative flex h-12 w-16 shrink-0 items-center justify-center rounded-2xl transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          isOn && displayState !== 'mixed'
            ? 'bg-[var(--theme-on-bg)] ring-1 ring-[var(--theme-on-border)]/30'
            : 'bg-surface ring-1 ring-default',
          displayState === 'mixed' ? '!ring-warning/60 dark:!ring-warning/40' : '',
          pending || group.memberCount === 0 ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      >
        <span className="relative inline-flex w-9 h-5" aria-hidden>
          <span className={[
            'absolute top-0 left-0 text-base leading-none rotate-[-14deg] translate-y-0.5 opacity-70 transition',
            isOn ? 'opacity-100 drop-shadow-[0_0_4px_var(--theme-bulb-tint)]' : 'grayscale opacity-50',
          ].join(' ')}>💡</span>
          <span className={[
            'absolute top-0 left-2.5 text-base leading-none -translate-y-px z-10 transition',
            isOn ? 'drop-shadow-[0_0_4px_var(--theme-bulb-tint)]' : 'grayscale opacity-50',
          ].join(' ')}>💡</span>
          <span className={[
            'absolute top-0 left-5 text-base leading-none rotate-[14deg] translate-y-0.5 opacity-70 transition',
            isOn ? 'opacity-100 drop-shadow-[0_0_4px_var(--theme-bulb-tint)]' : 'grayscale opacity-50',
          ].join(' ')}>💡</span>
        </span>
      </button>

      <div className="flex flex-col items-center gap-0.5 w-full min-w-0 text-center">
        <span className="text-sm font-semibold text-text truncate max-w-full" title={group.name}>{group.name}</span>
        <span className="text-[0.7rem] font-medium text-subtle">{stateLabel} · {group.memberCount}</span>
      </div>

      {group.hasBrightnessCapableMember && (
        <input
          type="range" min={0} max={100} step={1}
          value={displayBri}
          disabled={group.memberCount === 0 || !isOn}
          title={`Brightness ${displayBri}%`}
          className="slider slider-sm w-full"
          onClick={(e) => e.stopPropagation()}
          onChange={onBrightnessInput}
          onMouseUp={commitBrightness}
          onTouchEnd={commitBrightness}
        />
      )}

      {(group.unreachableCount > 0 || partial) && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {group.unreachableCount > 0 && (
            <Badge color="red" title={`${group.unreachableCount} unreachable`}>
              {group.unreachableCount} offline
            </Badge>
          )}
          {partial && <Badge color="amber" title={`${partial.failed} failed`}>{partial.failed} failed</Badge>}
        </div>
      )}
      {error && (
        <span
          className="absolute top-1.5 left-1.5 inline-flex size-4 items-center justify-center rounded-full bg-error text-[0.6rem] font-bold text-white"
          title={error}
        >!</span>
      )}

      {editing && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-xl bg-surface/75 p-0.5 backdrop-blur-md transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/tile:opacity-100 dark:bg-surface/65">
          <Button plain title="Edit group" aria-label="Edit group" onClick={(e) => { e.stopPropagation(); onEditGroup(group.id) }}>
            <PencilSquareIcon data-slot="icon" />
          </Button>
          <Button plain title="Ungroup" aria-label="Ungroup" onClick={(e) => { e.stopPropagation(); setConfirmUngroup(true) }}>
            <XMarkIcon data-slot="icon" />
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmUngroup}
        message={`Ungroup "${group.name}"? The lights stay in the room and become individually controllable again.`}
        confirmLabel="Ungroup"
        onConfirm={() => { onUngroup(group.id); setConfirmUngroup(false) }}
        onCancel={() => setConfirmUngroup(false)}
      />
    </div>
  )
}
