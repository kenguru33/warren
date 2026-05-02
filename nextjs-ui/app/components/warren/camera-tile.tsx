'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import {
  EyeSlashIcon,
  PencilSquareIcon,
  PlayIcon,
  TrashIcon,
} from '@heroicons/react/20/solid'
import type { SensorView } from '@/lib/shared/types'
import { useLongPress } from '@/lib/hooks/use-long-press'
import { ConfirmDialog } from './confirm-dialog'
import { RenameDialog } from './rename-dialog'
import { TileMenu, type TileMenuHandle, type TileMenuItem } from './tile-menu'

export function CameraTile({
  sensor,
  recentMotion,
  onOpenLive,
  onRenameSensor,
  onRemoveSensor,
  onHideSensor,
}: {
  sensor: SensorView
  recentMotion: boolean
  onOpenLive: (sensorId: number) => void
  onRenameSensor?: (sensorId: number, label: string) => void
  onRemoveSensor: (sensorId: number) => void
  onHideSensor?: (sensorId: number) => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmHide, setConfirmHide] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const menuRef = useRef<TileMenuHandle>(null)
  const { handlers: pressHandlers, wasLongPressRef } = useLongPress(() => menuRef.current?.open())

  function tap() {
    if (wasLongPressRef.current) return
    onOpenLive(sensor.id)
  }

  const items: TileMenuItem[] = [
    {
      key: 'live',
      label: 'Open live',
      icon: <PlayIcon data-slot="icon" />,
      onSelect: () => onOpenLive(sensor.id),
    },
    ...(onRenameSensor ? [{
      key: 'rename',
      label: 'Rename',
      icon: <PencilSquareIcon data-slot="icon" />,
      onSelect: () => setRenaming(true),
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
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap() }
      }}
      style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
      {...pressHandlers}
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

      <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm opacity-0 transition-opacity group-hover/tile:opacity-100">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25">
          <PlayIcon className="size-4" /> Live
        </span>
      </div>

      {recentMotion && (
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-error/90 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-white">
          <span className="size-1.5 rounded-full bg-white animate-warren-pulse" />
          Motion
        </span>
      )}

      <TileMenu
        ref={menuRef}
        items={items}
        positionClassName="absolute top-2 right-2 z-10"
        // White-on-image variant — the camera tile sits over a snapshot, so the
        // ghost-button hover bg is darker for legibility.
        triggerClassName="inline-flex size-7 items-center justify-center rounded-lg bg-black/40 text-white transition-colors hover:bg-black/60 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />

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
      <RenameDialog
        open={renaming}
        title="Rename camera"
        currentName={sensor.label}
        placeholder="Camera"
        onSave={name => onRenameSensor?.(sensor.id, name)}
        onClose={() => setRenaming(false)}
      />
    </div>
  )
}

// Image is imported for type compatibility but unused; keep the build happy when the
// snapshot path eventually moves to next/image — the code path stays the same.
void Image
