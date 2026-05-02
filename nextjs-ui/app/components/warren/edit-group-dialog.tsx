'use client'

import { type FormEvent, useEffect, useState } from 'react'
import type { LightGroupView } from '@/lib/shared/types'
import type { LightThemeKey } from '@/lib/shared/light-themes'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/app/components/dialog'
import { Field, Label } from '@/app/components/fieldset'
import { Input } from '@/app/components/input'
import { LightThemePicker } from './light-theme-picker'

/**
 * Single dialog that edits all user-facing properties of a light group:
 * name + theme. Replaces the prior split of "Rename group" + "Set theme"
 * with one entry-point so users don't have to remember which field lives
 * behind which menu item.
 *
 * Members editing stays separate (it's a multi-select tile flow, not a
 * dialog field). Ungroup stays separate (destructive action).
 */
export function EditGroupDialog({
  open,
  group,
  onSave,
  onClose,
}: {
  open: boolean
  group: LightGroupView
  onSave: (changes: { name: string; theme: LightThemeKey }) => void
  onClose: () => void
}) {
  const [name, setName] = useState(group.name)
  const [theme, setTheme] = useState<LightThemeKey>(group.theme)

  useEffect(() => {
    if (open) {
      setName(group.name)
      setTheme(group.theme)
    }
  }, [open, group.name, group.theme])

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSave({ name: trimmed, theme })
    onClose()
  }

  const dirty = name.trim() !== group.name || theme !== group.theme

  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <form onSubmit={submit}>
        <DialogTitle>Edit light group</DialogTitle>
        <DialogBody className="space-y-5">
          <Field>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={60}
              autoFocus
            />
          </Field>
          <div>
            <span className="block text-base/6 font-medium text-text select-none sm:text-sm/6">
              Color theme
            </span>
            <div className="mt-1.5">
              <LightThemePicker value={theme} onChange={setTheme} />
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!dirty || !name.trim()}>Save</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
