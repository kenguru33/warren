'use client'

import { useEffect, useState } from 'react'
import type { RoomWithSensors, SensorView } from '@/lib/shared/types'
import { ClimateTile } from './climate-tile'
import { MotionTile } from './motion-tile'
import { CameraTile } from './camera-tile'
import { HueLightTile } from './hue-light-tile'
import { LightGroupTile } from './light-group-tile'
import { MasterLightToggle } from './master-light-toggle'
import { ConfirmDialog } from './confirm-dialog'
import { AppSwitch } from './app-switch'

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
  onSaveRef,
  onRemoveRoom,
  onRemoveSensor,
  onRenameRoom,
  onAddSensor,
  onOpenLive,
  onViewHistory,
  onEditSensor,
  onAddGroup,
  onEditGroup,
  onUngroup,
  onMasterToggled,
  onOpenGroupDetail,
}: {
  room: RoomWithSensors
  onSaveRef: (roomId: number, refTemp: number | null, refHumidity: number | null) => void
  onRemoveRoom: (roomId: number) => void
  onRemoveSensor: (sensorId: number) => void
  onRenameRoom: (roomId: number, name: string) => void
  onAddSensor: (roomId: number) => void
  onOpenLive: (sensorId: number) => void
  onViewHistory: (sensor: SensorView) => void
  onEditSensor: (sensorId: number) => void
  onAddGroup: (roomId: number) => void
  onEditGroup: (groupId: number) => void
  onUngroup: (groupId: number) => void
  onMasterToggled: () => void
  onOpenGroupDetail: (groupId: number) => void
}) {
  const tempSensor   = room.sensors.find(s => s.type === 'temperature') ?? null
  const humSensor    = room.sensors.find(s => s.type === 'humidity')    ?? null
  const motionSensor = room.sensors.find(s => s.type === 'motion')      ?? null
  const cameras      = room.sensors.filter(s => s.type === 'camera')
  const lights       = room.sensors.filter(s => s.type === 'light')
  const ungroupedLights = lights.filter(l => !l.groupId)
  const lightsById = new Map(lights.map(l => [l.id, l]))
  const lightGroups = room.lightGroups ?? []

  const hasClimate = !!(tempSensor || humSensor)
  const hasAmbient = !!(tempSensor || humSensor || motionSensor)
  const hasCamera  = cameras.length > 0
  const hasLighting = lightGroups.length > 0 || ungroupedLights.length > 0
  const hasAnyContent = hasAmbient || hasCamera || hasLighting

  const [editing, setEditing] = useState(false)
  const [refTempEnabled, setRefTempEnabled] = useState(room.reference !== null && room.reference.refTemp !== null)
  const [refHumEnabled, setRefHumEnabled]   = useState(room.reference !== null && room.reference.refHumidity !== null)
  const [refTemp, setRefTemp]               = useState<number>(room.reference?.refTemp     ?? 21)
  const [refHumidity, setRefHumidity]       = useState<number>(room.reference?.refHumidity ?? 50)
  const [editName, setEditName]             = useState(room.name)
  const [confirmRoom, setConfirmRoom]       = useState(false)

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

  // Reconcile refs from props when not editing.
  useEffect(() => {
    if (!editing) {
      setRefTempEnabled(room.reference !== null && room.reference.refTemp !== null)
      setRefHumEnabled(room.reference !== null && room.reference.refHumidity !== null)
      setRefTemp(room.reference?.refTemp ?? 21)
      setRefHumidity(room.reference?.refHumidity ?? 50)
    }
  }, [room.reference, editing])

  function openEditing() {
    setRefTempEnabled(room.reference !== null && room.reference.refTemp !== null)
    setRefHumEnabled(room.reference !== null && room.reference.refHumidity !== null)
    setRefTemp(room.reference?.refTemp ?? 21)
    setRefHumidity(room.reference?.refHumidity ?? 50)
    setEditName(room.name)
    setEditing(true)
  }

  function closeEditing() {
    if (editName.trim() && editName.trim() !== room.name) onRenameRoom(room.id, editName.trim())
    setEditing(false)
  }

  function saveRef() {
    if (editName.trim() && editName.trim() !== room.name) onRenameRoom(room.id, editName.trim())
    onSaveRef(room.id, refTempEnabled ? refTemp : null, refHumEnabled ? refHumidity : null)
    setEditing(false)
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

  return (
    <div className="group/room relative rounded-xl bg-surface p-6 ring-1 ring-default shadow-sm dark:ring-white/10 dark:shadow-none [container-type:inline-size]">
      <div className="flex items-center justify-between gap-3 min-h-[32px]">
        {editing ? (
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') closeEditing()
              if (e.key === 'Escape') setEditing(false)
            }}
            maxLength={60}
            className="flex-1 min-w-0 rounded-lg border border-default bg-input px-3 py-1.5 text-base/6 font-semibold tracking-tight text-text outline-none focus:border-default focus:ring-2 focus:ring-accent focus:ring-inset dark:border-white/10"
          />
        ) : (
          <h2 className="truncate text-base/6 font-semibold text-text">{room.name}</h2>
        )}

        <div className="flex items-center gap-1 ml-auto">
          {room.lightMaster && (
            <MasterLightToggle
              master={room.lightMaster}
              pending={masterPending}
              error={masterError}
              partial={masterPartial}
              onToggle={toggleRoomMaster}
            />
          )}
          <div className={[
            'flex items-center gap-0.5 transition-opacity',
            editing
              ? 'opacity-100'
              : 'pointer-fine:opacity-0 pointer-fine:group-hover/room:opacity-100 pointer-fine:group-focus-within/room:opacity-100',
          ].join(' ')}>
            <button type="button" className="btn-icon !size-8" title="Add sensor" onClick={() => onAddSensor(room.id)}>
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
            </button>
            <button
              type="button"
              className={`btn-icon !size-8 ${editing ? '!bg-default !text-text dark:!bg-white/10 dark:!text-white' : ''}`}
              title="Edit room"
              onClick={editing ? closeEditing : openEditing}
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
            </button>
            <button type="button" className="btn-icon !size-8 hover:!text-red-600 dark:hover:!text-red-400" title="Remove room" onClick={() => setConfirmRoom(true)}>
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
            </button>
          </div>
        </div>
      </div>

      {hasAnyContent && (
        <div className="mt-6 flex flex-col gap-5 [&>*+*]:pt-5 [&>*+*]:border-t [&>*+*]:border-default dark:[&>*+*]:border-white/5">
          {hasAmbient && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
              {tempSensor && (
                <ClimateTile
                  variant="temperature"
                  sensor={tempSensor}
                  reference={room.reference}
                  editing={editing}
                  isOffline={isOffline(tempSensor.lastRecordedAt)}
                  onViewHistory={onViewHistory}
                  onEditSensor={onEditSensor}
                  onRemoveSensor={onRemoveSensor}
                />
              )}
              {humSensor && (
                <ClimateTile
                  variant="humidity"
                  sensor={humSensor}
                  reference={room.reference}
                  editing={editing}
                  isOffline={isOffline(humSensor.lastRecordedAt)}
                  onViewHistory={onViewHistory}
                  onEditSensor={onEditSensor}
                  onRemoveSensor={onRemoveSensor}
                />
              )}
              {motionSensor && (
                <MotionTile
                  sensor={motionSensor}
                  editing={editing}
                  isOffline={isOffline(motionSensor.lastRecordedAt)}
                  recentMotion={recentMotion(motionSensor.lastMotion)}
                  motionLabel={motionLabelFor(motionSensor.lastMotion)}
                  onViewHistory={onViewHistory}
                  onEditSensor={onEditSensor}
                  onRemoveSensor={onRemoveSensor}
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
                  editing={editing}
                  recentMotion={recentMotion(cam.lastMotion)}
                  onOpenLive={onOpenLive}
                  onEditSensor={onEditSensor}
                  onRemoveSensor={onRemoveSensor}
                />
              ))}
            </div>
          )}

          {hasLighting && (
            <div className="flex flex-col gap-3">
              {lightGroups.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                  {lightGroups.map(group => (
                    <LightGroupTile
                      key={`group-${group.id}`}
                      group={group}
                      members={group.memberSensorIds.map(id => lightsById.get(id)).filter((s): s is SensorView => !!s)}
                      editing={editing}
                      onEditGroup={onEditGroup}
                      onUngroup={onUngroup}
                      onOpenDetail={onOpenGroupDetail}
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
                      editing={editing}
                      onEditSensor={onEditSensor}
                      onRemoveSensor={onRemoveSensor}
                      onToggled={onMasterToggled}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {editing && lights.length >= 2 && (
        <div className="mt-5 pt-4 border-t border-default dark:border-white/5">
          <button
            type="button"
            onClick={() => onAddGroup(room.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-strong px-3 py-1.5 text-xs/5 font-medium text-muted hover:text-text hover:border-strong dark:border-white/15 dark:hover:text-white dark:hover:border-white/30 transition-colors"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
            Group lights
          </button>
        </div>
      )}

      {editing && hasClimate && (
        <div className="mt-5 pt-5 border-t border-default dark:border-white/5 flex flex-col gap-5">
          {tempSensor && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm/6 font-medium text-muted">Target temperature</span>
                <AppSwitch checked={refTempEnabled} onChange={setRefTempEnabled} label="Enable target" />
              </div>
              {refTempEnabled && (
                <div className="flex flex-col gap-1.5">
                  <div className="text-sm/6 font-semibold text-text">{refTemp}°C</div>
                  <input type="range" min={10} max={30} step={0.5} value={refTemp} onChange={e => setRefTemp(Number(e.target.value))} className="slider" />
                  <div className="flex justify-between text-[0.65rem] text-subtle"><span>10°</span><span>20°</span><span>30°</span></div>
                </div>
              )}
            </div>
          )}
          {humSensor && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm/6 font-medium text-muted">Target humidity</span>
                <AppSwitch checked={refHumEnabled} onChange={setRefHumEnabled} label="Enable target" />
              </div>
              {refHumEnabled && (
                <div className="flex flex-col gap-1.5">
                  <div className="text-sm/6 font-semibold text-text">{refHumidity}%</div>
                  <input type="range" min={20} max={80} step={1} value={refHumidity} onChange={e => setRefHumidity(Number(e.target.value))} className="slider" />
                  <div className="flex justify-between text-[0.65rem] text-subtle"><span>20%</span><span>50%</span><span>80%</span></div>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" className="btn-primary btn-sm" onClick={saveRef}>Save</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRoom}
        message={`Delete room "${room.name}"? This will also remove all its sensors.`}
        onConfirm={() => { onRemoveRoom(room.id); setConfirmRoom(false) }}
        onCancel={() => setConfirmRoom(false)}
      />
    </div>
  )
}
