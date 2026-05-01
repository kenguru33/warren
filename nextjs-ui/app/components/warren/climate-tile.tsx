'use client'

import { useState } from 'react'
import { PencilSquareIcon, XMarkIcon } from '@heroicons/react/20/solid'
import type { RoomReference, SensorView } from '@/lib/shared/types'
import { ConfirmDialog } from './confirm-dialog'

export function ClimateTile({
  sensor,
  reference,
  variant,
  editing,
  isOffline,
  onViewHistory,
  onEditSensor,
  onRemoveSensor,
}: {
  sensor: SensorView
  reference: RoomReference | null
  variant: 'temperature' | 'humidity'
  editing: boolean
  isOffline: boolean
  onViewHistory: (sensor: SensorView) => void
  onEditSensor: (sensorId: number) => void
  onRemoveSensor: (sensorId: number) => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  const isTemp = variant === 'temperature'
  const icon = isTemp ? '🌡️' : '💧'
  const label = isTemp ? 'Temperature' : 'Humidity'
  const unit = isTemp ? '°C' : '%'
  const refValue = isTemp ? reference?.refTemp ?? null : reference?.refHumidity ?? null
  const refUnit = isTemp ? '°' : '%'

  const formattedValue = sensor.latestValue === null ? '—' : `${sensor.latestValue}${unit}`

  const deviation = (() => {
    if (sensor.latestValue === null || refValue === null) return null
    const diff = sensor.latestValue - refValue
    return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}${refUnit}`
  })()
  const deviationDirection = deviation ? (parseFloat(deviation) > 0 ? 'over' : 'under') : null

  return (
    <button
      type="button"
      onClick={() => onViewHistory(sensor)}
      className={[
        'group/tile relative flex flex-col items-start gap-1.5 rounded-2xl px-4 py-4 text-left ring-1 transition cursor-pointer',
        isOffline
          ? 'bg-error/[0.04] ring-error/30 hover:ring-error/50'
          : 'bg-surface-2/60 ring-default/70 hover:bg-surface-2 hover:ring-default dark:ring-white/5 dark:hover:ring-white/10',
      ].join(' ')}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-lg">{icon}</span>
        {isOffline && <span className="badge badge-error">Offline</span>}
      </div>
      <div className={`text-2xl font-bold tabular-nums leading-none mt-1 ${isOffline ? 'text-subtle' : 'text-text'}`}>
        {formattedValue}
      </div>
      <div className="text-xs text-subtle uppercase tracking-wider font-medium">{label}</div>
      {sensor.label && <div className="text-xs text-muted truncate max-w-full">{sensor.label}</div>}
      {refValue !== null && (
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
          <span>Target {refValue}{refUnit}</span>
          {deviation && (
            <span className={`font-semibold ${deviationDirection === 'over' ? 'text-error' : 'text-success'}`}>
              {deviation}
            </span>
          )}
        </div>
      )}

      {isTemp && (
        <div className="mt-1 flex gap-1.5">
          <span className={`inline-flex items-center transition-colors ${sensor.heaterActive ? 'text-orange-500' : 'text-default'}`} title="Heater">
            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M3 6 Q6 3 9 6 Q12 9 15 6 Q18 3 21 6"/>
              <path d="M3 12 Q6 9 9 12 Q12 15 15 12 Q18 9 21 12"/>
              <path d="M3 18 Q6 15 9 18 Q12 21 15 18 Q18 15 21 18"/>
            </svg>
          </span>
          <span className={`inline-flex items-center transition-colors ${sensor.fanActive ? 'text-sky-400' : 'text-default'}`} title="Fan">
            <svg className="size-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6.93-1A7 7 0 0 0 13 4.07V2h-2v2.07A7 7 0 0 0 5.07 10H3v2h2.07A7 7 0 0 0 11 19.93V22h2v-2.07A7 7 0 0 0 18.93 13H21v-2h-2.07zM12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/></svg>
          </span>
        </div>
      )}

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
