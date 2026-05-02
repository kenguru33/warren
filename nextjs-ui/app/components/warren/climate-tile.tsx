'use client'

import { useRef, useState } from 'react'
import {
  ChartBarIcon,
  Cog6ToothIcon,
  EyeSlashIcon,
  TrashIcon,
} from '@heroicons/react/20/solid'
import type { RoomReference, SensorView } from '@/lib/shared/types'
import { Badge } from '@/app/components/badge'
import { Strong, Text } from '@/app/components/text'
import { useLongPress } from '@/lib/hooks/use-long-press'
import { ConfirmDialog } from './confirm-dialog'
import { TileMenu, type TileMenuHandle, type TileMenuItem } from './tile-menu'

function activate(handler: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handler()
    }
  }
}

export function ClimateTile({
  sensor,
  reference,
  variant,
  isOffline,
  onViewHistory,
  onEditSensor,
  onSetTarget,
  onRemoveSensor,
  onHideSensor,
}: {
  sensor: SensorView
  reference: RoomReference | null
  variant: 'temperature' | 'humidity'
  isOffline: boolean
  onViewHistory: (sensor: SensorView) => void
  onEditSensor: (sensorId: number) => void
  onSetTarget?: (variant: 'temperature' | 'humidity') => void
  onRemoveSensor: (sensorId: number) => void
  onHideSensor?: (sensorId: number) => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmHide, setConfirmHide] = useState(false)

  const menuRef = useRef<TileMenuHandle>(null)
  const { handlers: pressHandlers, wasLongPressRef } = useLongPress(() => menuRef.current?.open())

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
    ...(onSetTarget ? [{
      key: 'set-target',
      label: 'Set target',
      icon: <ChartBarIcon data-slot="icon" />,
      onSelect: () => onSetTarget(variant),
    }] : []),
    ...(isTemp ? [{
      key: 'configure',
      label: 'Configure',
      icon: <Cog6ToothIcon data-slot="icon" />,
      onSelect: () => onEditSensor(sensor.id),
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
      role="button"
      tabIndex={0}
      onClick={tap}
      onKeyDown={activate(tap)}
      style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
      {...pressHandlers}
      className={[
        'group/tile relative flex cursor-pointer flex-col items-start gap-1.5 rounded-2xl px-4 py-4 pr-10 text-left ring-1 transition focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        isOffline
          ? 'bg-error/[0.04] ring-error/30 hover:ring-error/50'
          : 'bg-surface-2/60 ring-default/70 hover:bg-surface-2 hover:ring-default dark:ring-white/5 dark:hover:ring-white/10',
      ].join(' ')}
    >
      <TileMenu ref={menuRef} items={items} />

      <div className="flex w-full items-center justify-between">
        <span className="text-lg">{icon}</span>
        {isOffline && <Badge color="red">Offline</Badge>}
      </div>
      <Strong className={`mt-1 text-2xl leading-none tabular-nums ${isOffline ? '!text-subtle' : ''}`}>
        {formattedValue}
      </Strong>
      <div className="text-xs font-medium tracking-wider text-subtle uppercase">{label}</div>
      {sensor.label && <Text className="max-w-full truncate !text-xs">{sensor.label}</Text>}
      {refValue !== null && (
        <div
          className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle"
          // Tap on the target sub-line to open the per-tile target editor —
          // suppresses the outer tile-tap (history) so the action is unambiguous.
          onClick={onSetTarget ? (e) => { e.stopPropagation(); onSetTarget(variant) } : undefined}
          role={onSetTarget ? 'button' : undefined}
          tabIndex={onSetTarget ? 0 : undefined}
          title={onSetTarget ? 'Tap to change target' : undefined}
        >
          <span className={onSetTarget ? 'underline-offset-2 hover:underline' : undefined}>
            Target {refValue}{refUnit}
          </span>
          {deviation && (
            <span className={`font-semibold ${deviationDirection === 'over' ? 'text-error' : 'text-success'}`}>
              {deviation}
            </span>
          )}
        </div>
      )}

      {isTemp && (
        // Heater = orange, fan = sky. Intentionally fixed indicator colors —
        // they encode physical meaning (heat / cool) that's independent of
        // the active color scheme.
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
