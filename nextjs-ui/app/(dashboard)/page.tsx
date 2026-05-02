'use client'

import { useMemo, useState } from 'react'
import type { LightGroupView, RoomWithSensors, SensorView } from '@/lib/shared/types'
import { LIGHT_THEMES } from '@/lib/shared/light-themes'
import { useRooms } from '@/lib/hooks/use-rooms'
import { Button } from '@/app/components/button'
import { Heading } from '@/app/components/heading'
import { Text } from '@/app/components/text'
import { RoomCard } from '@/app/components/warren/room-card'
import { AddRoomModal } from '@/app/components/warren/add-room-modal'
import { AddSensorModal, type AddSensorPayload } from '@/app/components/warren/add-sensor-modal'
import { LightGroupModal } from '@/app/components/warren/light-group-modal'
import { LightGroupDetailModal } from '@/app/components/warren/light-group-detail-modal'
import { SensorConfigModal } from '@/app/components/warren/sensor-config-modal'
import { SensorHistoryModal } from '@/app/components/warren/sensor-history-modal'
import { LiveStreamModal } from '@/app/components/warren/live-stream-modal'
import { EditLightModal } from '@/app/components/warren/edit-light-modal'

export default function DashboardPage() {
  const { rooms, lastUpdated, refresh, addRoom, removeRoom, renameRoom, removeSensor, addSensor, saveReference, clearReference } = useRooms()

  const [showAddRoom, setShowAddRoom] = useState(false)
  const [addSensorRoomId, setAddSensorRoomId] = useState<number | null>(null)

  // Light group modal — used for both create (groupId === null) and edit
  const [groupModalCtx, setGroupModalCtx] = useState<{ roomId: number; groupId: number | null } | null>(null)
  const [groupDetailId, setGroupDetailId] = useState<number | null>(null)

  // Sensor modals
  const [historySensor, setHistorySensor] = useState<{ sensor: SensorView; roomName: string } | null>(null)
  const [configSensor, setConfigSensor] = useState<{ deviceId: string; label: string | null } | null>(null)
  const [liveStream, setLiveStream] = useState<{ name: string; streamUrl: string | null } | null>(null)
  const [editingLight, setEditingLight] = useState<SensorView | null>(null)
  // Optimistic per-light color overrides — populated when the user picks a color
  // in EditLightModal so the bulb in LightGroupDetailModal updates immediately
  // instead of waiting for the next /rooms refresh (where color isn't tracked).
  const [lightColorOverrides, setLightColorOverrides] = useState<Record<number, string>>({})

  const addSensorRoom = useMemo(
    () => addSensorRoomId !== null ? rooms.find(r => r.id === addSensorRoomId) ?? null : null,
    [addSensorRoomId, rooms],
  )

  const groupModalRoom = useMemo(() => {
    if (!groupModalCtx) return null
    return rooms.find(r => r.id === groupModalCtx.roomId) ?? null
  }, [groupModalCtx, rooms])

  const groupDetail = useMemo<{ room: RoomWithSensors; group: LightGroupView; members: SensorView[] } | null>(() => {
    if (groupDetailId === null) return null
    for (const room of rooms) {
      const group = room.lightGroups.find(g => g.id === groupDetailId)
      if (group) {
        const lightsById = new Map(room.sensors.filter(s => s.type === 'light').map(s => [s.id, s]))
        const members = group.memberSensorIds
          .map(id => lightsById.get(id))
          .filter((s): s is SensorView => !!s)
        return { room, group, members }
      }
    }
    return null
  }, [groupDetailId, rooms])

  async function handleSaveRef(roomId: number, refTemp: number | null, refHumidity: number | null) {
    if (refTemp === null && refHumidity === null) {
      await clearReference(roomId)
    } else {
      await saveReference(roomId, { refTemp, refHumidity })
    }
  }

  async function handleAddSensors(payloads: AddSensorPayload[]) {
    if (addSensorRoomId === null) return
    for (const p of payloads) {
      await addSensor({
        roomId: addSensorRoomId,
        type: p.type,
        sensorId: p.sensorId,
        deviceId: p.deviceId,
        label: p.label || undefined,
        streamUrl: p.streamUrl || undefined,
        snapshotUrl: p.snapshotUrl || undefined,
      })
    }
    setAddSensorRoomId(null)
  }

  function findSensor(sensorId: number): { sensor: SensorView; roomName: string } | null {
    for (const room of rooms) {
      const sensor = room.sensors.find(s => s.id === sensorId)
      if (sensor) return { sensor, roomName: room.name }
    }
    return null
  }

  function handleEditSensor(sensorId: number) {
    const found = findSensor(sensorId)
    if (!found?.sensor.deviceId) return
    if (found.sensor.type === 'temperature') {
      setConfigSensor({ deviceId: found.sensor.deviceId, label: found.sensor.label })
    } else if (found.sensor.type === 'light') {
      setEditingLight(found.sensor)
    } else {
      // Other sensor types fall back to a history view; rename for non-light/non-temp
      // sensors lives on the /sensors page.
      setHistorySensor(found)
    }
  }

  // Resolve the active group's bulbPalette so EditLightModal can constrain its
  // color picker when the light is part of a group.
  const editingLightGroup = useMemo(() => {
    if (!editingLight?.groupId) return null
    for (const r of rooms) {
      const g = r.lightGroups.find(g => g.id === editingLight.groupId)
      if (g) return g
    }
    return null
  }, [editingLight, rooms])
  const editingLightPalette = editingLightGroup
    ? LIGHT_THEMES[editingLightGroup.theme]?.bulbPalette
    : undefined
  // Current color the bulb displays: prefer an explicit override (a previous
  // pick this session), otherwise the round-robin palette color the group
  // would assign by member index.
  const editingLightCurrentColor = (() => {
    if (!editingLight) return undefined
    const override = lightColorOverrides[editingLight.id]
    if (override) return override
    if (!editingLightGroup || !editingLightPalette?.length) return undefined
    const idx = editingLightGroup.memberSensorIds.indexOf(editingLight.id)
    if (idx < 0) return undefined
    return editingLightPalette[idx % editingLightPalette.length]
  })()

  function handleViewHistory(sensor: SensorView) {
    const found = findSensor(sensor.id)
    if (found) setHistorySensor(found)
  }

  function handleOpenLive(sensorId: number) {
    const found = findSensor(sensorId)
    if (!found) return
    setLiveStream({
      name: found.sensor.label ?? 'Camera',
      streamUrl: found.sensor.streamUrl ?? null,
    })
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <Heading>Dashboard</Heading>
            <Text className="mt-1">Last updated {lastUpdated}</Text>
          </div>
          <Button onClick={() => setShowAddRoom(true)}>
            Add room
          </Button>
        </div>

        {rooms.length === 0 ? (
          <div className="rounded-2xl bg-surface ring-1 ring-default shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_20px_-12px_rgba(0,0,0,0.08)] dark:ring-white/10 dark:shadow-none dark:[box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.04)] p-10 text-center">
            <Text>
              No rooms yet. Click &quot;Add room&quot; to create one and assign sensors to it.
            </Text>
          </div>
        ) : (
          // Auto-fill columns capped at the room-card max width (36rem),
          // left-aligned via justify-start so cards pack to the left edge
          // rather than stretching on wide monitors.
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[repeat(auto-fill,minmax(0,36rem))] sm:justify-start">
            {rooms.map(room => (
              <RoomCard
                key={room.id}
                room={room}
                onSaveRef={handleSaveRef}
                onRemoveRoom={removeRoom}
                onRemoveSensor={removeSensor}
                onRenameRoom={renameRoom}
                onAddSensor={(roomId) => setAddSensorRoomId(roomId)}
                onOpenLive={handleOpenLive}
                onViewHistory={handleViewHistory}
                onEditSensor={handleEditSensor}
                onAddGroup={(roomId) => setGroupModalCtx({ roomId, groupId: null })}
                onEditGroup={(groupId) => {
                  for (const r of rooms) {
                    if (r.lightGroups.some(g => g.id === groupId)) {
                      setGroupModalCtx({ roomId: r.id, groupId })
                      return
                    }
                  }
                }}
                onUngroup={async (groupId) => {
                  await fetch(`/api/light-groups/${groupId}`, { method: 'DELETE', credentials: 'include' })
                  refresh()
                }}
                onMasterToggled={refresh}
                onOpenGroupDetail={(groupId) => setGroupDetailId(groupId)}
              />
            ))}
          </div>
        )}
      </div>

      <AddRoomModal
        open={showAddRoom}
        onClose={() => setShowAddRoom(false)}
        onAdd={async (name) => {
          await addRoom(name)
          setShowAddRoom(false)
        }}
      />

      <AddSensorModal
        open={addSensorRoom !== null}
        roomName={addSensorRoom?.name ?? ''}
        onClose={() => setAddSensorRoomId(null)}
        onAdd={handleAddSensors}
      />

      {groupModalRoom && groupModalCtx && (
        <LightGroupModal
          open
          roomId={groupModalRoom.id}
          roomName={groupModalRoom.name}
          lights={groupModalRoom.sensors.filter(s => s.type === 'light')}
          group={
            groupModalCtx.groupId !== null
              ? groupModalRoom.lightGroups.find(g => g.id === groupModalCtx.groupId) ?? null
              : null
          }
          groupsInRoom={groupModalRoom.lightGroups}
          onClose={() => setGroupModalCtx(null)}
          onSaved={() => { setGroupModalCtx(null); refresh() }}
          onDeleted={() => { setGroupModalCtx(null); refresh() }}
        />
      )}

      <LightGroupDetailModal
        open={groupDetail !== null}
        group={groupDetail?.group ?? null}
        members={groupDetail?.members ?? []}
        colorOverrides={lightColorOverrides}
        onClose={() => setGroupDetailId(null)}
        onToggled={refresh}
        onEditSensor={handleEditSensor}
      />

      {historySensor && (
        <SensorHistoryModal
          open
          sensor={historySensor.sensor}
          roomName={historySensor.roomName}
          onClose={() => setHistorySensor(null)}
        />
      )}

      {configSensor && (
        <SensorConfigModal
          open
          deviceId={configSensor.deviceId}
          label={configSensor.label}
          onClose={() => setConfigSensor(null)}
        />
      )}

      {liveStream && (
        <LiveStreamModal
          open
          cameraName={liveStream.name}
          streamUrl={liveStream.streamUrl}
          onClose={() => setLiveStream(null)}
        />
      )}

      <EditLightModal
        open={!!editingLight}
        sensor={editingLight}
        paletteColors={editingLightPalette}
        groupName={editingLightGroup?.name}
        currentColor={editingLightCurrentColor}
        onClose={() => setEditingLight(null)}
        onSaved={refresh}
        onColorApplied={(sensorId, hex) => {
          setLightColorOverrides(prev => ({ ...prev, [sensorId]: hex }))
        }}
      />
    </>
  )
}
