'use client'

import { FormEvent, useState } from 'react'
import { AppDialog } from './app-dialog'

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
    <AppDialog open={open} onClose={onClose} maxWidthClass="max-w-md">
      <form onSubmit={submit}>
        <div className="px-6 pt-5 pb-4 border-b border-default">
          <h3 className="text-base/6 font-semibold text-text">Add room</h3>
          <p className="mt-1 text-sm/6 text-muted">Group sensors and lights by room.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor="room-name" className="label">Room name</label>
            <input
              id="room-name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input mt-1.5"
              placeholder="e.g. Living room"
              autoFocus
              maxLength={60}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-default bg-surface-2/50">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!name.trim()}>Add room</button>
        </div>
      </form>
    </AppDialog>
  )
}
