'use client'

import { useEffect, useState } from 'react'
import {
  PencilSquareIcon,
  PlusIcon,
  Squares2X2Icon,
  TrashIcon,
} from '@heroicons/react/20/solid'
import type { RoomReference, RoomWithSensors, SensorView } from '@/lib/shared/types'
import type { LightThemeKey } from '@/lib/shared/light-themes'
import { Heading } from '@/app/components/heading'
import { Input } from '@/app/components/input'
import { ClimateTile } from './climate-tile'
import { ClimateTargetDialog } from './climate-target-dialog'
import { MotionTile } from './motion-tile'
import { CameraTile } from './camera-tile'
import { HueLightTile } from './hue-light-tile'
import { LightGroupTile } from './light-group-tile'
import { MasterLightToggle } from './master-light-toggle'
import { ConfirmDialog } from './confirm-dialog'
import { MultiSelectActionBar } from './multi-select-action-bar'
import { TileMenu, type TileMenuItem } from './tile-menu'

function motionLabelFor(ts: number | null) {
  if (!ts) return null
  const diff = Math.round((Date.now() - ts) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  return `${Math.round(diff / 3600)}h ago`
}

function recentMotion(ts: number | null) {
  return ts ? Date.now() - ts < 5 * 60 * 1000 : false
}

export function RoomCard({
  room,
  onRemoveRoom,
  onRemoveSensor,
  onRenameRoom,
  onAddSensor,
  onOpenLive,
  onViewHistory,
  onEditSensor,
  onUngroup,
  onMasterToggled,
  onOpenGroupDetail,
  onHideSensor,
  onSaveLightGroup,
  onSaveReference,
  lightColorOverrides,
}: {
  room: RoomWithSensors
  onRemoveRoom: (roomId: number) => void
  onRemoveSensor: (sensorId: number) => void
  onRenameRoom: (roomId: number, name: string) => void
  onAddSensor: (roomId: number) => void
  onOpenLive: (sensorId: number) => void
  onViewHistory: (sensor: SensorView) => void
  onEditSensor: (sensorId: number) => void
  onUngroup: (groupId: number) => void
  onMasterToggled: () => void
  onOpenGroupDetail: (groupId: number) => void
  onHideSensor?: (sensorId: number) => void
  onSaveLightGroup?: (groupId: number, changes: { name: string; theme: LightThemeKey }) => void
  onSaveReference?: (roomId: number, ref: RoomReference) => void
  /** Per-sensor color picks from EditLightModal — painted on the matching
   *  HueLightTile's bulb-icon background when on. */
  lightColorOverrides?: Record<number, string>
}) {
  const tempSensor   = room.sensors.find(s => s.type === 'temperature') ?? null
  const humSensor    = room.sensors.find(s => s.type === 'humidity')    ?? null
  const motionSensor = room.sensors.find(s => s.type === 'motion')      ?? null
  const cameras      = room.sensors.filter(s => s.type === 'camera')
  const lights       = room.sensors.filter(s => s.type === 'light')
  const ungroupedLights = lights.filter(l => !l.groupId)
  const lightsById = new Map(lights.map(l => [l.id, l]))
  const lightGroups = room.lightGroups ?? []

  const hasAmbient = !!(tempSensor || humSensor || motionSensor)
  const hasCamera  = cameras.length > 0
  const hasLighting = lightGroups.length > 0 || ungroupedLights.length > 0
  const hasAnyContent = hasAmbient || hasCamera || hasLighting

  const [renaming, setRenaming] = useState(false)
  const [editName, setEditName] = useState(room.name)
  const [confirmRoom, setConfirmRoom] = useState(false)
  const [targetVariant, setTargetVariant] = useState<'temperature' | 'humidity' | null>(null)

  // Multi-select grouping state — scoped to this room card per the spec.
  const [selectionMode, setSelectionMode] = useState<'idle' | 'create' | 'edit-group'>('idle')
  const [selectedLightIds, setSelectedLightIds] = useState<Set<number>>(new Set())
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [groupingError, setGroupingError] = useState<string | null>(null)

  const [masterPending, setMasterPending] = useState(false)
  const [masterError, setMasterError]     = useState<string | null>(null)
  const [masterPartial, setMasterPartial] = useState<{ ok: number; failed: number } | null>(null)

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [])

  function isOffline(ms: number | null) {
    return !ms || now - ms > 30_000
  }

  function startRename() {
    setEditName(room.name)
    setRenaming(true)
  }

  function commitRename() {
    const trimmed = editName.trim()
    // Empty submit reverts silently per the spec ("I changed my mind" gesture).
    if (trimmed && trimmed !== room.name) onRenameRoom(room.id, trimmed)
    setRenaming(false)
  }

  function cancelRename() {
    setRenaming(false)
  }

  function startCreateSelection(seedLightId?: number) {
    setSelectionMode('create')
    setEditingGroupId(null)
    setSelectedLightIds(new Set(seedLightId ? [seedLightId] : []))
    setGroupingError(null)
  }

  function startEditMembers(groupId: number) {
    const group = lightGroups.find(g => g.id === groupId)
    setSelectionMode('edit-group')
    setEditingGroupId(groupId)
    setSelectedLightIds(new Set(group?.memberSensorIds ?? []))
    setGroupingError(null)
  }

  function cancelSelection() {
    setSelectionMode('idle')
    setEditingGroupId(null)
    setSelectedLightIds(new Set())
    setGroupingError(null)
  }

  function toggleLightSelection(lightId: number) {
    setSelectedLightIds(prev => {
      const next = new Set(prev)
      if (next.has(lightId)) next.delete(lightId)
      else next.add(lightId)
      return next
    })
  }

  async function commitCreateGroup(name: string) {
    setGroupingError(null)
    try {
      const res = await fetch(`/api/rooms/${room.id}/light-groups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, sensorIds: [...selectedLightIds], theme: 'slate' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      cancelSelection()
      onMasterToggled()
    } catch (err) {
      setGroupingError(err instanceof Error ? err.message : 'Failed to group lights')
    }
  }

  async function commitEditGroup(name: string) {
    if (editingGroupId === null) return
    setGroupingError(null)
    try {
      const res = await fetch(`/api/light-groups/${editingGroupId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, sensorIds: [...selectedLightIds] }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      cancelSelection()
      onMasterToggled()
    } catch (err) {
      setGroupingError(err instanceof Error ? err.message : 'Failed to save group')
    }
  }

  async function commitUngroup() {
    if (editingGroupId === null) return
    onUngroup(editingGroupId)
    cancelSelection()
  }

  function handleSaveSingleRef(value: number | null) {
    if (!onSaveReference || !targetVariant) return
    const next: RoomReference = targetVariant === 'temperature'
      ? { refTemp: value, refHumidity: room.reference?.refHumidity ?? null }
      : { refTemp: room.reference?.refTemp ?? null, refHumidity: value }
    onSaveReference(room.id, next)
  }

  async function toggleRoomMaster(nextOn: boolean) {
    if (masterPending) return
    setMasterPending(true)
    setMasterError(null)
    setMasterPartial(null)
    try {
      const res = await fetch(`/api/rooms/${room.id}/lights-state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ on: nextOn }),
      })
      if (!res.ok) {
        let payload: { data?: { error?: string }; message?: string } = {}
        try { payload = await res.json() } catch {}
        throw payload
      }
      const summary = await res.json() as { successCount: number; failureCount: number }
      if (summary.failureCount > 0) {
        setMasterPartial({ ok: summary.successCount, failed: summary.failureCount })
      }
      onMasterToggled()
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string }
      setMasterError(e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed'))
    } finally {
      setMasterPending(false)
    }
  }

  // Room-level actions only. Light-specific actions ("Group lights…") live on
  // the Lights section header alongside the MasterLightToggle, so each kebab's
  // scope matches the user's mental model when they reach for it.
  //
  // "Rename room" is also reachable by tapping the heading directly — the menu
  // entry is the discoverable form; the heading-tap is a power-user shortcut.
  const roomMenuItems: TileMenuItem[] = [
    {
      key: 'rename-room',
      label: 'Rename room',
      icon: <PencilSquareIcon data-slot="icon" />,
      onSelect: () => startRename(),
    },
    {
      key: 'add-device',
      label: 'Add device',
      icon: <PlusIcon data-slot="icon" />,
      onSelect: () => onAddSensor(room.id),
    },
    {
      key: 'remove-room',
      label: 'Remove room',
      icon: <TrashIcon data-slot="icon" />,
      tone: 'destructive',
      onSelect: () => setConfirmRoom(true),
    },
  ]

  const lightsMenuItems: TileMenuItem[] = lights.length >= 2
    ? [{
      key: 'group-lights',
      label: 'Group lights…',
      icon: <Squares2X2Icon data-slot="icon" />,
      onSelect: () => startCreateSelection(),
    }]
    : []

  return (
    <article
      className={[
        'group/room relative w-full max-w-md rounded-2xl bg-surface p-6 ring-1 ring-default transition-[box-shadow,--tw-ring-color] duration-150',
        'shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_20px_-12px_rgba(0,0,0,0.08)] hover:ring-strong',
        'dark:ring-white/10 dark:shadow-none dark:[box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.04)] dark:hover:ring-white/20',
        '[container-type:inline-size]',
      ].join(' ')}
    >
      <div
        className={[
          'flex min-h-[32px] items-center justify-between gap-3',
          hasAnyContent ? 'border-b border-default/60 pb-4 mb-5 dark:border-white/5' : '',
        ].join(' ')}
      >
        {renaming ? (
          <Input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') cancelRename()
            }}
            onBlur={commitRename}
            maxLength={60}
            autoFocus
            className="flex-1 [&_input]:!text-lg/6 [&_input]:!font-semibold [&_input]:!tracking-tight"
          />
        ) : (
          <Heading
            level={2}
            onClick={startRename}
            title="Tap to rename"
            className="cursor-text truncate !text-lg/6 font-semibold tracking-tight"
          >
            {room.name}
          </Heading>
        )}

        <TileMenu
          items={roomMenuItems}
          aria-label="Room menu"
          positionClassName="shrink-0"
        />
      </div>

      {hasAnyContent && (
        <div className="flex flex-col gap-6 [&>*+*]:pt-6 [&>*+*]:border-t [&>*+*]:border-default/60 dark:[&>*+*]:border-white/5">
          {hasAmbient && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
              {tempSensor && (
                <ClimateTile
                  variant="temperature"
                  sensor={tempSensor}
                  reference={room.reference}
                  isOffline={isOffline(tempSensor.lastRecordedAt)}
                  onViewHistory={onViewHistory}
                  onEditSensor={onEditSensor}
                  onSetTarget={onSaveReference ? setTargetVariant : undefined}
                  onRemoveSensor={onRemoveSensor}
                  onHideSensor={onHideSensor}
                />
              )}
              {humSensor && (
                <ClimateTile
                  variant="humidity"
                  sensor={humSensor}
                  reference={room.reference}
                  isOffline={isOffline(humSensor.lastRecordedAt)}
                  onViewHistory={onViewHistory}
                  onEditSensor={onEditSensor}
                  onSetTarget={onSaveReference ? setTargetVariant : undefined}
                  onRemoveSensor={onRemoveSensor}
                  onHideSensor={onHideSensor}
                />
              )}
              {motionSensor && (
                <MotionTile
                  sensor={motionSensor}
                  isOffline={isOffline(motionSensor.lastRecordedAt)}
                  recentMotion={recentMotion(motionSensor.lastMotion)}
                  motionLabel={motionLabelFor(motionSensor.lastMotion)}
                  onViewHistory={onViewHistory}
                  onRemoveSensor={onRemoveSensor}
                  onHideSensor={onHideSensor}
                />
              )}
            </div>
          )}

          {hasCamera && (
            <div className="grid grid-cols-1 gap-3">
              {cameras.map(cam => (
                <CameraTile
                  key={cam.id}
                  sensor={cam}
                  recentMotion={recentMotion(cam.lastMotion)}
                  onOpenLive={onOpenLive}
                  onRemoveSensor={onRemoveSensor}
                  onHideSensor={onHideSensor}
                />
              ))}
            </div>
          )}

          {hasLighting && (
            <div className="flex flex-col gap-3">
              <div className="relative flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  Lights
                </span>
                <div className="flex items-center gap-1">
                  {room.lightMaster && (
                    <MasterLightToggle
                      master={room.lightMaster}
                      pending={masterPending}
                      error={masterError}
                      partial={masterPartial}
                      onToggle={toggleRoomMaster}
                    />
                  )}
                  {lightsMenuItems.length > 0 && (
                    <TileMenu
                      items={lightsMenuItems}
                      aria-label="Lights menu"
                      positionClassName="shrink-0"
                    />
                  )}
                </div>
              </div>
              {lightGroups.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                  {lightGroups.map(group => (
                    <LightGroupTile
                      key={`group-${group.id}`}
                      group={group}
                      members={group.memberSensorIds.map(id => lightsById.get(id)).filter((s): s is SensorView => !!s)}
                      onUngroup={onUngroup}
                      onOpenDetail={onOpenGroupDetail}
                      onEditMembers={startEditMembers}
                      onSaveGroup={onSaveLightGroup}
                      onToggled={onMasterToggled}
                    />
                  ))}
                </div>
              )}
              {ungroupedLights.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                  {ungroupedLights.map(light => (
                    <HueLightTile
                      key={light.id}
                      sensor={light}
                      colorOverride={lightColorOverrides?.[light.id]}
                      selected={selectedLightIds.has(light.id)}
                      selectionMode={selectionMode !== 'idle'}
                      onEditSensor={onEditSensor}
                      onRemoveSensor={onRemoveSensor}
                      onHideSensor={onHideSensor}
                      onToggleSelect={toggleLightSelection}
                      onStartSelect={
                        selectionMode === 'idle' && lights.length >= 2
                          ? startCreateSelection
                          : undefined
                      }
                      onToggled={onMasterToggled}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectionMode !== 'idle' && (
        <MultiSelectActionBar
          mode={selectionMode}
          count={selectedLightIds.size}
          initialName={
            selectionMode === 'edit-group' && editingGroupId !== null
              ? lightGroups.find(g => g.id === editingGroupId)?.name ?? ''
              : ''
          }
          onCancel={cancelSelection}
          onCreate={commitCreateGroup}
          onSave={commitEditGroup}
          onUngroup={commitUngroup}
        />
      )}
      {groupingError && (
        <p className="mt-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error ring-1 ring-error/30">
          {groupingError}
        </p>
      )}

      <ConfirmDialog
        open={confirmRoom}
        message={`Delete room "${room.name}"? This will also remove all its sensors.`}
        onConfirm={() => { onRemoveRoom(room.id); setConfirmRoom(false) }}
        onCancel={() => setConfirmRoom(false)}
      />

      {targetVariant && (
        <ClimateTargetDialog
          open
          variant={targetVariant}
          currentValue={
            targetVariant === 'temperature'
              ? room.reference?.refTemp ?? null
              : room.reference?.refHumidity ?? null
          }
          currentEnabled={
            targetVariant === 'temperature'
              ? (room.reference?.refTemp ?? null) !== null
              : (room.reference?.refHumidity ?? null) !== null
          }
          onSave={handleSaveSingleRef}
          onClose={() => setTargetVariant(null)}
        />
      )}
    </article>
  )
}
