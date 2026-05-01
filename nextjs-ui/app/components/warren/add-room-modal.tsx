'use client'

import { FormEvent, useState } from 'react'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/app/components/dialog'
import { Field, Label } from '@/app/components/fieldset'
import { Input } from '@/app/components/input'

export function AddRoomModal({
  open,
  onAdd,
  onClose,
}: {
  open: boolean
  onAdd: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) {
      onAdd(name.trim())
      setName('')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <form onSubmit={submit}>
        <DialogTitle>Add room</DialogTitle>
        <DialogDescription>Group sensors and lights by room.</DialogDescription>
        <DialogBody>
          <Field>
            <Label htmlFor="room-name">Room name</Label>
            <Input
              id="room-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Living room"
              autoFocus
              maxLength={60}
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!name.trim()}>Add room</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
