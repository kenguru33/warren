'use client'

import { useEffect, useMemo, useState } from 'react'
import type { LightGroupView, SensorView } from '@/lib/shared/types'
import { DEFAULT_LIGHT_THEME, type LightThemeKey } from '@/lib/shared/light-themes'
import { Badge } from '@/app/components/badge'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/app/components/dialog'
import { Field, Label } from '@/app/components/fieldset'
import { Input } from '@/app/components/input'
import { ConfirmDialog } from './confirm-dialog'
import { LightThemePicker } from './light-theme-picker'

export function LightGroupModal({
  open,
  roomId,
  roomName,
  lights,
  group,
  groupsInRoom,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean
  roomId: number
  roomName: string
  lights: SensorView[]
  group: LightGroupView | null
  groupsInRoom: LightGroupView[]
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const isEdit = !!group
  const [name, setName] = useState(group?.name ?? '')
  const [themeKey, setThemeKey] = useState<LightThemeKey>(group?.theme ?? DEFAULT_LIGHT_THEME)
  const [selectedIds, setSelectedIds] = useState<number[]>([...(group?.memberSensorIds ?? [])])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset state when (re)opening or switching group.
  useEffect(() => {
    if (open) {
      setName(group?.name ?? '')
      setThemeKey(group?.theme ?? DEFAULT_LIGHT_THEME)
      setSelectedIds([...(group?.memberSensorIds ?? [])])
      setError(null)
      setSaving(false)
      setConfirmDelete(false)
    }
  }, [open, group?.id])

  // Live preview: paint with new palette when changing theme on an existing group that's on.
  useEffect(() => {
    if (!group) return
    if (group.state === 'all-off') return
    if (themeKey === group.theme) return
    fetch(`/api/light-groups/${group.id}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ on: true, theme: themeKey }),
    }).catch(() => {})
  }, [themeKey])

  const otherGroupBySensor = useMemo(() => {
    const map = new Map<number, string>()
    for (const g of groupsInRoom) {
      if (group && g.id === group.id) continue
      for (const sid of g.memberSensorIds) map.set(sid, g.name)
    }
    return map
  }, [groupsInRoom, group])

  const selectedIdsSet = new Set(selectedIds)
  const trimmedName = name.trim()
  const willUngroup = isEdit && selectedIds.length < 2
  const canSave = trimmedName.length > 0 && (isEdit || selectedIds.length >= 2)

  const validationMessage = trimmedName.length === 0
    ? 'Group needs a name'
    : !isEdit && selectedIds.length < 2
      ? 'Pick at least two lights'
      : null

  const saveLabel = !isEdit ? 'Create' : willUngroup ? 'Ungroup' : 'Save'

  const hasMixedCapability = useMemo(() => {
    let hasBri = false, hasNoBri = false
    for (const id of selectedIds) {
      const l = lights.find(x => x.id === id)
      if (!l) continue
      if (l.capabilities?.brightness) hasBri = true
      else hasNoBri = true
    }
    return hasBri && hasNoBri
  }, [selectedIds, lights])

  function toggleLight(id: number) {
    if (otherGroupBySensor.has(id)) return
    setSelectedIds(prev => {
      const i = prev.indexOf(id)
      if (i >= 0) return prev.filter((_, j) => j !== i)
      return [...prev, id]
    })
  }

  async function save() {
    if (!canSave) return
    if (willUngroup) {
      await ungroup()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const sensorIds = selectedIds.slice()
      const url = group
        ? `/api/light-groups/${group.id}`
        : `/api/rooms/${roomId}/light-groups`
      const method = group ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimmedName, sensorIds, theme: themeKey }),
      })
      if (!res.ok) {
        let payload: { data?: { error?: string; message?: string }; statusMessage?: string; message?: string } = {}
        try { payload = await res.json() } catch {}
        throw payload
      }
      onSaved()
    } catch (err: unknown) {
      const e = err as { data?: { error?: string; message?: string }; statusMessage?: string; message?: string }
      setError(e.data?.message ?? e.statusMessage ?? e.message ?? 'failed')
    } finally {
      setSaving(false)
    }
  }

  async function ungroup() {
    if (!group) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/light-groups/${group.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        let payload: { message?: string } = {}
        try { payload = await res.json() } catch {}
        throw payload
      }
      onDeleted()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e.message ?? 'failed')
    } finally {
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-accent-soft text-xl ring-1 ring-accent/20">💡</div>
        <div className="min-w-0">
          <DialogTitle className="truncate">{group ? 'Edit light group' : 'Group lights'}</DialogTitle>
          <p className="mt-0.5 truncate text-xs text-subtle">{roomName}</p>
        </div>
      </div>

      <DialogBody className="space-y-4 overflow-y-auto pretty-scroll">
        <Field>
          <Label>Group name</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') onClose()
            }}
            placeholder="e.g. Reading nook"
            maxLength={60}
            autoFocus
          />
        </Field>

        <Field>
          <Label>Color theme</Label>
          <div className="mt-1.5">
            <LightThemePicker value={themeKey} onChange={setThemeKey} />
          </div>
        </Field>

        <div>
          <Label>Lights</Label>
          {lights.length === 0 ? (
            <div className="mt-1.5 text-center text-sm text-subtle py-6 rounded-lg bg-surface-2 ring-1 ring-default">
              This room has no lights to group.
            </div>
          ) : (
            <div className="mt-1.5 max-h-56 overflow-y-auto pretty-scroll rounded-lg bg-input ring-1 ring-inset ring-default p-1.5 dark:ring-white/10">
              {lights.map(l => {
                const checked = selectedIdsSet.has(l.id)
                const lockedTo = otherGroupBySensor.get(l.id)
                const disabled = !!lockedTo
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={disabled}
                    onClick={() => toggleLight(l.id)}
                    className={[
                      'flex w-full items-center gap-3 px-3 py-2 rounded-md text-left transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      disabled
                        ? 'cursor-not-allowed opacity-55'
                        : 'cursor-pointer hover:bg-surface-2 dark:hover:bg-white/[0.04]',
                      checked && !disabled ? 'bg-accent/10' : '',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden
                      className={[
                        'flex size-4 shrink-0 items-center justify-center rounded-md ring-1 transition-colors',
                        checked
                          ? 'bg-accent ring-accent text-white'
                          : 'bg-surface ring-default dark:ring-white/15',
                      ].join(' ')}
                    >
                      {checked && (
                        <svg className="size-3" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.6a1 1 0 0 1-1.42.006L3.29 9.79a1 1 0 1 1 1.42-1.41l3.79 3.79 6.79-6.88a1 1 0 0 1 1.414-.006Z" clipRule="evenodd"/>
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 text-sm text-text truncate">
                      {l.label?.trim() || l.hueName?.trim() || `Light #${l.id}`}
                    </span>
                    {lockedTo ? (
                      <Badge color="red">in {lockedTo}</Badge>
                    ) : !l.capabilities?.brightness ? (
                      <Badge color="zinc">on/off</Badge>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {hasMixedCapability && (
          <div className="rounded-lg bg-warning/10 ring-1 ring-warning/20 px-3 py-2 text-xs text-warning">
            Some lights don&apos;t support brightness. The master slider will only affect dimmable lights.
          </div>
        )}
        {willUngroup && (
          <div className="rounded-lg bg-warning/10 ring-1 ring-warning/20 px-3 py-2 text-xs text-warning">
            A group needs at least two lights — saving with fewer will ungroup them.
          </div>
        )}
        {validationMessage && (name || selectedIds.length > 0) && (
          <div className="rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-xs text-error">
            {validationMessage}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-xs text-error">{error}</div>
        )}
      </DialogBody>

      <DialogActions>
        {group && (
          <Button color="red" type="button" disabled={saving} className="sm:mr-auto" onClick={() => setConfirmDelete(true)}>
            Ungroup
          </Button>
        )}
        <Button plain type="button" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button
          type="button"
          color={willUngroup ? 'red' : undefined}
          disabled={!canSave || saving}
          onClick={save}
        >
          {saveLabel}
        </Button>
      </DialogActions>

      <ConfirmDialog
        open={confirmDelete}
        message={`Ungroup "${group?.name ?? ''}"? The lights stay in the room and become individually controllable again.`}
        confirmLabel="Ungroup"
        onConfirm={ungroup}
        onCancel={() => setConfirmDelete(false)}
      />
    </Dialog>
  )
}
