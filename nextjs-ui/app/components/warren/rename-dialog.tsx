'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/app/components/dialog'
import { Field, Label } from '@/app/components/fieldset'
import { Input } from '@/app/components/input'

/**
 * Single-input rename dialog used by sensor tiles (climate / motion / camera)
 * and light groups. Empty submit reverts silently per the dashboard's
 * inline-rename convention; otherwise calls `onSave(trimmed)`.
 */
export function RenameDialog({
  open,
  title,
  label = 'Name',
  currentName,
  placeholder,
  onSave,
  onClose,
}: {
  open: boolean
  title: string
  label?: string
  currentName: string | null
  placeholder?: string
  onSave: (name: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(currentName ?? '')

  useEffect(() => {
    if (open) setDraft(currentName ?? '')
  }, [open, currentName])

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = draft.trim()
    if (trimmed && trimmed !== (currentName ?? '')) onSave(trimmed)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <form onSubmit={submit}>
        <DialogTitle>{title}</DialogTitle>
        <DialogBody>
          <Field>
            <Label>{label}</Label>
            <Input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              maxLength={60}
              autoFocus
              placeholder={placeholder}
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
