'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import { CheckIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { Button } from '@/app/components/button'
import { Input } from '@/app/components/input'

/**
 * Sticky-pinned action bar shown at the bottom of a room card while a
 * multi-select grouping flow is active.
 *
 * - `count` = N currently selected lights.
 * - In `'create'` mode requires count ≥ 2 to enable Group; in `'edit-group'`
 *   mode count < 2 triggers ungroup via `onUngroup`.
 * - "Group" replaces the buttons with an inline-name Input → Save commits.
 */
export function MultiSelectActionBar({
  mode,
  count,
  initialName = '',
  onCancel,
  onCreate,
  onSave,
  onUngroup,
}: {
  mode: 'create' | 'edit-group'
  count: number
  initialName?: string
  onCancel: () => void
  onCreate?: (name: string) => void
  onSave?: (name: string) => void
  onUngroup?: () => void
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setName(initialName) }, [initialName])
  useEffect(() => {
    if (naming) inputRef.current?.focus()
  }, [naming])

  const isCreate = mode === 'create'
  const willUngroup = !isCreate && count < 2
  const canCommit = isCreate ? count >= 2 : true

  function startNaming() {
    if (isCreate) setNaming(true)
    else if (willUngroup) onUngroup?.()
    else onSave?.(name.trim() || initialName)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (isCreate) onCreate?.(trimmed)
    else onSave?.(trimmed)
  }

  return (
    <div className="sticky bottom-2 z-10 mt-4 -mx-2 rounded-xl bg-modal/95 px-3 py-2 ring-1 ring-default shadow-lg backdrop-blur-sm dark:ring-white/10 dark:bg-surface-2/95">
      {naming ? (
        <form onSubmit={submit} className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); setNaming(false) }
            }}
            placeholder="Group name"
            maxLength={60}
            className="flex-1"
          />
          <Button plain type="button" aria-label="Back" onClick={() => setNaming(false)}>
            <XMarkIcon data-slot="icon" />
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            <CheckIcon data-slot="icon" />
            Save
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm/6 font-medium text-text">
            {count} selected
          </span>
          {willUngroup && (
            <span className="text-xs/5 text-warning">Saving with &lt; 2 ungroups</span>
          )}
          <span className="flex-1" />
          <Button plain type="button" onClick={onCancel}>Cancel</Button>
          <Button
            type="button"
            color={willUngroup ? 'red' : undefined}
            disabled={!canCommit && !willUngroup}
            onClick={startNaming}
          >
            {isCreate ? 'Group' : willUngroup ? 'Ungroup' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  )
}
