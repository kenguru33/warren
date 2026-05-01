'use client'

import { useState } from 'react'
import Image from 'next/image'
import { PencilSquareIcon, XMarkIcon, PlayIcon } from '@heroicons/react/20/solid'
import type { SensorView } from '@/lib/shared/types'
import { ConfirmDialog } from './confirm-dialog'

export function CameraTile({
  sensor,
  editing,
  recentMotion,
  onOpenLive,
  onEditSensor,
  onRemoveSensor,
}: {
  sensor: SensorView
  editing: boolean
  recentMotion: boolean
  onOpenLive: (sensorId: number) => void
  onEditSensor: (sensorId: number) => void
  onRemoveSensor: (sensorId: number) => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenLive(sensor.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenLive(sensor.id) }
      }}
      className="group/tile relative aspect-video w-full cursor-pointer overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-default/70 transition hover:ring-default focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:ring-white/5 dark:hover:ring-white/10"
    >
      {sensor.snapshotUrl ? (
        // External MJPEG/JPEG endpoints — Next/Image's optimization isn't useful here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sensor.snapshotUrl} alt={sensor.label ?? 'Camera'} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-subtle">
          <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-8 pb-2.5">
        <div className="text-sm font-medium text-white text-left truncate">{sensor.label ?? 'Camera'}</div>
      </div>

      {!editing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm opacity-0 transition-opacity group-hover/tile:opacity-100">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25">
            <PlayIcon className="size-4" /> Live
          </span>
        </div>
      )}

      {recentMotion && (
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-error/90 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-white">
          <span className="size-1.5 rounded-full bg-white animate-warren-pulse" />
          Motion
        </span>
      )}

      {editing && (
        <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-xl bg-black/55 p-0.5 backdrop-blur-md transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/tile:opacity-100">
          <span
            role="button"
            tabIndex={0}
            className="inline-flex items-center justify-center size-7 rounded-lg text-white transition-colors hover:bg-white/15"
            title="Edit"
            onClick={(e) => { e.stopPropagation(); onEditSensor(sensor.id) }}
          >
            <PencilSquareIcon className="size-3.5" />
          </span>
          <span
            role="button"
            tabIndex={0}
            className="inline-flex items-center justify-center size-7 rounded-lg text-white transition-colors hover:bg-error/80"
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
    </div>
  )
}

// Image is imported for type compatibility but unused; keep the build happy when the
// snapshot path eventually moves to next/image — the code path stays the same.
void Image
