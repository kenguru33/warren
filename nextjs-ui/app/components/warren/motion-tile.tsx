'use client'

import { useRef, useState } from 'react'
import {
  ChartBarIcon,
  EyeSlashIcon,
  TrashIcon,
} from '@heroicons/react/20/solid'
import type { SensorView } from '@/lib/shared/types'
import { Badge } from '@/app/components/badge'
import { useLongPress } from '@/lib/hooks/use-long-press'
import { ConfirmDialog } from './confirm-dialog'
import { TileMenu, type TileMenuHandle, type TileMenuItem } from './tile-menu'

export function MotionTile({
  sensor,
  isOffline,
  recentMotion,
  motionLabel,
  onViewHistory,
  onRemoveSensor,
  onHideSensor,
}: {
  sensor: SensorView
  isOffline: boolean
  recentMotion: boolean
  motionLabel: string | null
  onViewHistory: (sensor: SensorView) => void
  onRemoveSensor: (sensorId: number) => void
  onHideSensor?: (sensorId: number) => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmHide, setConfirmHide] = useState(false)
  const valueText = !sensor.lastMotion ? '—' : recentMotion ? 'Detected' : 'Clear'

  const menuRef = useRef<TileMenuHandle>(null)
  const { handlers: pressHandlers, wasLongPressRef } = useLongPress(() => menuRef.current?.open())

  function tap() {
    if (wasLongPressRef.current) return
    onViewHistory(sensor)
  }

  const items: TileMenuItem[] = [
    {
      key: 'history',
      label: 'View history',
      icon: <ChartBarIcon data-slot="icon" />,
      onSelect: () => onViewHistory(sensor),
    },
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
      role="button"
      tabIndex={0}
      onClick={tap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap() }
      }}
      style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
      {...pressHandlers}
      className={[
        'group/tile relative flex cursor-pointer flex-col items-start gap-1.5 rounded-2xl px-4 py-4 pr-10 text-left ring-1 transition focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        isOffline
          ? 'bg-error/[0.04] ring-error/30'
          : recentMotion
            ? 'bg-accent/10 ring-accent/30'
            : 'bg-surface-2/60 ring-default/70 hover:bg-surface-2 hover:ring-default dark:ring-white/5 dark:hover:ring-white/10',
      ].join(' ')}
    >
      <TileMenu ref={menuRef} items={items} />

      <div className="flex w-full items-center justify-between">
        <span className="text-lg">🏃</span>
        {isOffline ? (
          <Badge color="red">Offline</Badge>
        ) : recentMotion ? (
          <Badge color="amber" className="animate-warren-pulse">Live</Badge>
        ) : null}
      </div>
      <div className={`mt-1 text-2xl font-bold leading-none ${isOffline ? 'text-subtle' : recentMotion ? 'text-warning' : 'text-text'}`}>
        {valueText}
      </div>
      <div className="text-xs font-medium tracking-wider text-subtle uppercase">Motion</div>
      {sensor.label && <div className="max-w-full truncate text-xs text-muted">{sensor.label}</div>}
      {sensor.lastMotion && motionLabel && <div className="text-xs text-subtle">{motionLabel}</div>}

      <ConfirmDialog
        open={confirmRemove}
        message="Remove this sensor from the room?"
        confirmLabel="Remove"
        onConfirm={() => { onRemoveSensor(sensor.id); setConfirmRemove(false) }}
        onCancel={() => setConfirmRemove(false)}
      />
      <ConfirmDialog
        open={confirmHide}
        title="Hide this sensor?"
        message="Hidden sensors won't appear in discovery. You can unhide from /sensors."
        confirmLabel="Hide"
        tone="default"
        onConfirm={() => { onHideSensor?.(sensor.id); setConfirmHide(false) }}
        onCancel={() => setConfirmHide(false)}
      />
    </div>
  )
}
