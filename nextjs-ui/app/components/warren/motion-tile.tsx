'use client'

import { useState } from 'react'
import { PencilSquareIcon, XMarkIcon } from '@heroicons/react/20/solid'
import type { SensorView } from '@/lib/shared/types'
import { Badge } from '@/app/components/badge'
import { ConfirmDialog } from './confirm-dialog'

export function MotionTile({
  sensor,
  editing,
  isOffline,
  recentMotion,
  motionLabel,
  onViewHistory,
  onEditSensor,
  onRemoveSensor,
}: {
  sensor: SensorView
  editing: boolean
  isOffline: boolean
  recentMotion: boolean
  motionLabel: string | null
  onViewHistory: (sensor: SensorView) => void
  onEditSensor: (sensorId: number) => void
  onRemoveSensor: (sensorId: number) => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const valueText = !sensor.lastMotion ? '—' : recentMotion ? 'Detected' : 'Clear'

  return (
    <button
      type="button"
      onClick={() => onViewHistory(sensor)}
      className={[
        'group/tile relative flex flex-col items-start gap-1.5 rounded-2xl px-4 py-4 text-left ring-1 transition cursor-pointer',
        isOffline
          ? 'bg-error/[0.04] ring-error/30'
          : recentMotion
            ? 'bg-accent/10 ring-accent/30'
            : 'bg-surface-2/60 ring-default/70 hover:bg-surface-2 hover:ring-default dark:ring-white/5 dark:hover:ring-white/10',
      ].join(' ')}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-lg">🏃</span>
        {isOffline ? (
          <Badge color="red">Offline</Badge>
        ) : recentMotion ? (
          <Badge color="amber" className="animate-warren-pulse">Live</Badge>
        ) : null}
      </div>
      <div className={`text-2xl font-bold leading-none mt-1 ${isOffline ? 'text-subtle' : recentMotion ? 'text-warning' : 'text-text'}`}>
        {valueText}
      </div>
      <div className="text-xs text-subtle uppercase tracking-wider font-medium">Motion</div>
      {sensor.label && <div className="text-xs text-muted truncate max-w-full">{sensor.label}</div>}
      {sensor.lastMotion && motionLabel && <div className="text-xs text-subtle">{motionLabel}</div>}

      {editing && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-xl bg-surface/75 p-0.5 backdrop-blur-md transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/tile:opacity-100 dark:bg-surface/65">
          <span
            role="button"
            tabIndex={0}
            className="btn-icon size-7"
            title="Edit"
            onClick={(e) => { e.stopPropagation(); onEditSensor(sensor.id) }}
          >
            <PencilSquareIcon className="size-3.5" />
          </span>
          <span
            role="button"
            tabIndex={0}
            className="btn-icon size-7 hover:!text-error hover:!ring-error/40"
            title="Remove"
            onClick={(e) => { e.stopPropagation(); setConfirmRemove(true) }}
          >
            <XMarkIcon className="size-3.5" />
          </span>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        message="Remove this sensor from the room?"
        confirmLabel="Remove"
        onConfirm={() => { onRemoveSensor(sensor.id); setConfirmRemove(false) }}
        onCancel={() => setConfirmRemove(false)}
      />
    </button>
  )
}
