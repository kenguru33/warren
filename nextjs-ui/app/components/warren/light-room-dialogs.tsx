'use client'

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/app/components/alert'
import { Button } from '@/app/components/button'

export function GroupedLightGuardDialog({
  open,
  lightLabel,
  groupName,
  busy,
  error,
  onRemoveFromGroup,
  onCancel,
}: {
  open: boolean
  lightLabel: string
  groupName: string
  busy: boolean
  error?: string | null
  onRemoveFromGroup: () => void
  onCancel: () => void
}) {
  const groupDisplay = groupName || 'a light group'
  return (
    <Alert open={open} onClose={() => { if (!busy) onCancel() }}>
      <AlertTitle>Light is in a group</AlertTitle>
      <AlertDescription>
        <strong>{lightLabel}</strong> is part of the <strong>{groupDisplay}</strong> group.
        Remove it from the group before moving it to another room.
      </AlertDescription>
      {error && (
        <AlertDescription className="!text-error">{error}</AlertDescription>
      )}
      <AlertActions>
        <Button plain disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button color="dark/zinc" disabled={busy} onClick={onRemoveFromGroup}>
          {busy ? 'Removing…' : 'Remove from group'}
        </Button>
      </AlertActions>
    </Alert>
  )
}

export function MoveLightDialog({
  open,
  lightLabel,
  sourceRoomName,
  targetRoomName,
  mode,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  lightLabel: string
  sourceRoomName: string | null
  targetRoomName: string
  mode: 'move' | 'add'
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const source = sourceRoomName ?? 'Unassigned'
  const title = mode === 'add' ? 'Add light to room?' : 'Move light?'
  const action = mode === 'add' ? 'Add to room' : 'Move'
  return (
    <Alert open={open} onClose={() => { if (!busy) onCancel() }}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        Move <strong>{lightLabel}</strong> from <strong>{source}</strong> to <strong>{targetRoomName}</strong>?
      </AlertDescription>
      <AlertActions>
        <Button plain disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button color="dark/zinc" disabled={busy} onClick={onConfirm}>
          {busy ? 'Working…' : action}
        </Button>
      </AlertActions>
    </Alert>
  )
}

export function RemoveLightFromRoomDialog({
  open,
  lightLabel,
  roomName,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  lightLabel: string
  roomName: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Alert open={open} onClose={() => { if (!busy) onCancel() }}>
      <AlertTitle>Remove from room?</AlertTitle>
      <AlertDescription>
        <strong>{lightLabel}</strong> will be removed from <strong>{roomName}</strong> and become unassigned.
      </AlertDescription>
      <AlertActions>
        <Button plain disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button color="red" disabled={busy} onClick={onConfirm}>
          {busy ? 'Removing…' : 'Remove'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
