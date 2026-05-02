'use client'

import * as Headless from '@headlessui/react'
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  ArrowUturnLeftIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  EyeSlashIcon,
  HomeIcon,
  TagIcon,
} from '@heroicons/react/20/solid'
import type { MasterState } from '@/lib/shared/types'
import { Badge } from '@/app/components/badge'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/app/components/dialog'
import {
  DropdownDivider,
  DropdownHeading,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSection,
} from '@/app/components/dropdown'
import { Field, Label } from '@/app/components/fieldset'
import { Heading } from '@/app/components/heading'
import { Input } from '@/app/components/input'
import { Text } from '@/app/components/text'
import { SwitchField } from '@/app/components/switch'
import { AppSwitch } from '@/app/components/warren/app-switch'
import { ConfirmDialog } from '@/app/components/warren/confirm-dialog'
import { MasterLightToggle } from '@/app/components/warren/master-light-toggle'

interface LightRow {
  id: number | null
  deviceId: string | null
  type: string
  label: string | null
  roomId: number | null
  roomName: string | null
  origin?: 'esp32' | 'hue'
  capabilities?: { brightness?: boolean; colorTemp?: boolean; color?: boolean }
  lightOn?: boolean | null
  lightBrightness?: number | null
  lightReachable?: boolean | null
  hueName?: string | null
  groupId?: number | null
  groupName?: string | null
}

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json())

function matchesSearch(haystacks: (string | null | undefined)[], needle: string): boolean {
  if (!needle) return true
  const q = needle.toLowerCase()
  return haystacks.some(h => h?.toLowerCase().includes(q))
}

function briFromHue(b: number | null | undefined) {
  return Math.round(((b ?? 0) / 254) * 100)
}

export default function LightsPage() {
  const { data: sensors = [], mutate: refresh } = useSWR<LightRow[]>('/api/sensors', fetcher, { refreshInterval: 15_000 })
  const { data: blocked = [], mutate: refreshBlocked } = useSWR<{ deviceId: string; type: string }[]>(
    '/api/sensors/blocked', fetcher, { refreshInterval: 15_000 },
  )
  const { data: rooms = [] } = useSWR<{ id: number; name: string }[]>('/api/rooms', fetcher, { refreshInterval: 30_000 })
  const { data: globalMaster = null, mutate: refreshGlobalMaster } = useSWR<MasterState | null>(
    '/api/lights/master-state', fetcher, { refreshInterval: 15_000 },
  )

  const [search, setSearch] = useState('')
  const [onlyUnused, setOnlyUnused] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<LightRow | null>(null)
  const [editingLight, setEditingLight] = useState<LightRow | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [errorById, setErrorById] = useState<Record<string, string>>({})
  const [pendingById, setPendingById] = useState<Record<string, boolean>>({})

  const [globalMasterPending, setGlobalMasterPending] = useState(false)
  const [globalMasterError, setGlobalMasterError] = useState<string | null>(null)
  const [globalMasterPartial, setGlobalMasterPartial] = useState<{ ok: number; failed: number } | null>(null)

  const lights = useMemo(() => sensors.filter(s => s.type === 'light'), [sensors])
  const visibleLights = useMemo(() => {
    let list = lights
    if (onlyUnused) list = list.filter(s => !s.roomName)
    return list.filter(s => matchesSearch([s.label, s.hueName, s.deviceId, s.roomName, s.groupName], search))
  }, [lights, onlyUnused, search])
  const visibleBlocked = useMemo(() => (
    blocked.filter(b => b.type === 'light').filter(b => matchesSearch([b.deviceId], search))
  ), [blocked, search])

  function lightUrl(deviceId: string) {
    return `/api/integrations/hue/lights/${encodeURIComponent(deviceId)}/state`
  }

  async function postLightState(deviceId: string, body: { on?: boolean; brightness?: number }) {
    const res = await fetch(lightUrl(deviceId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      let payload: { data?: { error?: string }; message?: string } = {}
      try { payload = await res.json() } catch {}
      throw payload
    }
  }

  async function toggle(row: LightRow) {
    if (!row.deviceId) return
    const id = row.deviceId
    const next = !row.lightOn
    setPendingById(p => ({ ...p, [id]: true }))
    setErrorById(e => ({ ...e, [id]: '' }))
    try {
      await postLightState(id, { on: next })
      await refresh()
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string }
      setErrorById(prev => ({ ...prev, [id]: e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed') }))
    } finally {
      setPendingById(p => ({ ...p, [id]: false }))
    }
  }

  async function setBrightness(row: LightRow, percent: number) {
    if (!row.deviceId) return
    const id = row.deviceId
    setPendingById(p => ({ ...p, [id]: true }))
    setErrorById(e => ({ ...e, [id]: '' }))
    try {
      const body: { brightness: number; on?: boolean } = { brightness: percent }
      if (percent > 0 && !row.lightOn) body.on = true
      await postLightState(id, body)
      await refresh()
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string }
      setErrorById(prev => ({ ...prev, [id]: e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed') }))
    } finally {
      setPendingById(p => ({ ...p, [id]: false }))
    }
  }

  async function toggleGlobalMaster(nextOn: boolean) {
    if (globalMasterPending) return
    setGlobalMasterPending(true)
    setGlobalMasterError(null)
    setGlobalMasterPartial(null)
    try {
      const res = await fetch('/api/lights/master-state', {
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
        setGlobalMasterPartial({ ok: summary.successCount, failed: summary.failureCount })
      }
      await Promise.all([refresh(), refreshGlobalMaster()])
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string }
      setGlobalMasterError(e.data?.error === 'bridge_unreachable' ? 'Bridge unreachable' : (e.message ?? 'failed'))
    } finally {
      setGlobalMasterPending(false)
    }
  }

  function openEdit(row: LightRow) {
    setEditingLight(row)
    setEditingLabel(row.label ?? '')
  }

  async function saveEdit() {
    const row = editingLight
    if (!row) return
    const label = editingLabel.trim() || null
    if (row.id !== null) {
      await fetch(`/api/sensors/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label }),
      })
    } else if (row.deviceId) {
      await fetch('/api/sensors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: row.type, deviceId: row.deviceId, label }),
      })
    }
    setEditingLight(null)
    await refresh()
  }

  async function moveToRoom(row: LightRow, roomId: number) {
    if (row.id !== null) {
      await fetch(`/api/sensors/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId }),
      })
    } else if (row.deviceId) {
      await fetch('/api/sensors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: row.type, deviceId: row.deviceId, roomId, label: row.label ?? null }),
      })
    }
    await refresh()
  }

  async function removeFromRoom(row: LightRow) {
    if (row.id === null) return
    await fetch(`/api/sensors/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ roomId: null }),
    })
    await refresh()
  }

  async function confirmDelete() {
    const row = pendingDelete
    if (!row) return
    if (row.id !== null) {
      await fetch(`/api/sensors/${row.id}`, { method: 'DELETE', credentials: 'include' })
    }
    if (row.deviceId) {
      await fetch('/api/sensors/block', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ deviceId: row.deviceId, type: row.type }),
      })
    }
    setPendingDelete(null)
    await Promise.all([refresh(), refreshBlocked()])
  }

  async function restoreBlocked(b: { deviceId: string; type: string }) {
    await fetch('/api/sensors/unblock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(b),
    })
    await Promise.all([refresh(), refreshBlocked()])
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Heading>Lights</Heading>
            <Text className="mt-1">Toggle and dim every light, or filter to ones not yet placed in a room.</Text>
          </div>
          <div className="flex items-center gap-4">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              type="search"
              className="w-full sm:w-72"
              placeholder="Search lights…"
            />
            <SwitchField className="!grid-cols-[auto_auto] !gap-x-3">
              <Label>Unused only</Label>
              <AppSwitch checked={onlyUnused} onChange={setOnlyUnused} label="Show only unused" />
            </SwitchField>
          </div>
        </div>

        {globalMaster && (
          <MasterLightToggle
            variant="wide"
            master={globalMaster}
            pending={globalMasterPending}
            error={globalMasterError}
            partial={globalMasterPartial}
            label="All lights"
            onToggle={toggleGlobalMaster}
          />
        )}

        {visibleLights.length === 0 ? (
          <div className="rounded-xl bg-surface ring-1 ring-default shadow-sm dark:ring-white/10 dark:shadow-none p-12 text-center text-sm text-muted">
            {onlyUnused ? 'No unused lights.' : 'No lights registered. Connect a Hue Bridge from Integrations.'}
          </div>
        ) : (
          <ul role="list" className="rounded-xl bg-surface ring-1 ring-default shadow-sm dark:ring-white/10 dark:shadow-none divide-y divide-default dark:divide-white/10 overflow-hidden">
            {visibleLights.map((row, i) => (
              <li
                key={row.id ?? `${row.deviceId}:${row.type}:${i}`}
                className={[
                  'group/row flex items-center gap-x-4 px-5 py-4 transition-colors',
                  row.lightReachable === false ? 'bg-error/[0.04]' : 'hover:bg-default/50 dark:hover:bg-white/[0.02]',
                ].join(' ')}
              >
                <div className={[
                  'flex size-10 flex-none items-center justify-center rounded-lg text-lg ring-1 transition',
                  row.lightOn && row.lightReachable !== false
                    ? 'bg-accent/20 ring-accent/40 text-accent-strong'
                    : 'bg-surface-2 ring-default text-subtle dark:bg-white/5 dark:ring-white/10',
                ].join(' ')}>
                  <span className={`transition ${!row.lightOn ? 'grayscale opacity-50' : ''}`}>💡</span>
                </div>

                <div className="min-w-0 flex-auto">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm/6 font-semibold text-text truncate">
                      {row.label?.trim() || row.hueName?.trim() || 'Light'}
                    </p>
                    {row.origin === 'hue' && <Badge color="amber">Hue</Badge>}
                    {row.lightReachable === false && <Badge color="red">Unreachable</Badge>}
                    {row.groupName && <Badge color="blue">{row.groupName}</Badge>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs/5 text-subtle truncate">
                    <span className={row.roomName ? '' : 'italic'}>{row.roomName ?? 'Unassigned'}</span>
                    {row.deviceId && <span aria-hidden>·</span>}
                    {row.deviceId && <span className="font-mono">{row.deviceId}</span>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4" onClick={e => e.stopPropagation()}>
                  <div className="hidden sm:flex items-center gap-2 w-44">
                    {row.capabilities?.brightness && (
                      <>
                        <input
                          type="range" min={0} max={100} step={1}
                          defaultValue={briFromHue(row.lightBrightness)}
                          disabled={!row.deviceId || (row.deviceId ? !!pendingById[row.deviceId] : false) || row.lightReachable === false || !row.lightOn}
                          className="slider slider-sm flex-1"
                          onChange={e => setBrightness(row, Number(e.target.value))}
                        />
                        <span className="text-xs/5 text-subtle tabular-nums w-9 text-right">{briFromHue(row.lightBrightness)}%</span>
                      </>
                    )}
                  </div>
                  <AppSwitch
                    checked={!!row.lightOn}
                    disabled={!row.deviceId || (row.deviceId ? !!pendingById[row.deviceId] : false) || row.lightReachable === false}
                    label="On/Off"
                    onChange={() => toggle(row)}
                  />
                  <div className="w-5 shrink-0">
                    {row.deviceId && errorById[row.deviceId] && (
                      <Badge color="red" title={errorById[row.deviceId]}>!</Badge>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center" onClick={e => e.stopPropagation()}>
                  <Headless.Menu>
                    <Headless.MenuButton
                      as="button"
                      type="button"
                      aria-label="Light actions"
                      className="inline-flex size-8 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-2/50 hover:text-text focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:hover:bg-white/10 dark:hover:text-white"
                    >
                      <EllipsisVerticalIcon className="size-5" />
                    </Headless.MenuButton>
                    <DropdownMenu className="min-w-56" anchor="bottom end">
                      <DropdownItem onClick={() => openEdit(row)}>
                        <TagIcon data-slot="icon" />
                        <DropdownLabel>Rename</DropdownLabel>
                      </DropdownItem>
                      <DropdownDivider />
                      <DropdownSection>
                        <DropdownHeading>Room</DropdownHeading>
                        {rooms.length === 0 && (
                          <DropdownItem disabled>
                            <DropdownLabel>No rooms yet</DropdownLabel>
                          </DropdownItem>
                        )}
                        {rooms.map(r => {
                          const current = r.id === row.roomId
                          return (
                            <DropdownItem
                              key={r.id}
                              disabled={current}
                              onClick={() => { if (!current) moveToRoom(row, r.id) }}
                            >
                              {current ? <CheckIcon data-slot="icon" /> : <HomeIcon data-slot="icon" />}
                              <DropdownLabel>{r.name}</DropdownLabel>
                            </DropdownItem>
                          )
                        })}
                        {row.roomId !== null && row.id !== null && (
                          <DropdownItem
                            onClick={() => removeFromRoom(row)}
                            className="!text-error data-focus:!text-white"
                          >
                            <ArrowUturnLeftIcon data-slot="icon" />
                            <DropdownLabel>Remove from room</DropdownLabel>
                          </DropdownItem>
                        )}
                      </DropdownSection>
                      <DropdownDivider />
                      <DropdownItem
                        onClick={() => setPendingDelete(row)}
                        className="!text-warning data-focus:!text-white"
                      >
                        <EyeSlashIcon data-slot="icon" />
                        <DropdownLabel>Hide</DropdownLabel>
                      </DropdownItem>
                    </DropdownMenu>
                  </Headless.Menu>
                </div>
              </li>
            ))}
          </ul>
        )}

        {visibleBlocked.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">
              Hidden lights ({visibleBlocked.length})
            </h2>
            <ul role="list" className="rounded-2xl ring-1 ring-default/70 dark:ring-white/5 divide-y divide-default">
              {visibleBlocked.map(b => (
                <li key={`${b.deviceId}:${b.type}`} className="flex items-center gap-4 px-5 py-3 first:rounded-t-2xl last:rounded-b-2xl bg-surface-2/60">
                  <span className="text-base">💡</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-muted">Light</div>
                    <div className="text-xs text-subtle font-mono truncate">{b.deviceId}</div>
                  </div>
                  <Button outline onClick={() => restoreBlocked(b)}>Restore</Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        message={`Hide light "${pendingDelete?.label || pendingDelete?.hueName || 'Light'}"? You can restore it from the Hidden lights section below.`}
        confirmLabel="Hide"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <Dialog open={!!editingLight} onClose={() => setEditingLight(null)} size="md">
        {editingLight && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-2xl">💡</span>
              <div>
                <DialogTitle>Light</DialogTitle>
                {editingLight.deviceId && (
                  <div className="mt-0.5 font-mono text-xs text-subtle">{editingLight.deviceId}</div>
                )}
              </div>
            </div>
            <DialogBody>
              <Field>
                <Label>Label</Label>
                <Input
                  value={editingLabel}
                  onChange={e => setEditingLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveEdit()
                    if (e.key === 'Escape') setEditingLight(null)
                  }}
                  placeholder="Custom label…"
                  maxLength={60}
                  autoFocus
                />
              </Field>
            </DialogBody>
            <DialogActions>
              <Button plain type="button" onClick={() => setEditingLight(null)}>Cancel</Button>
              <Button type="button" onClick={saveEdit}>Save</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  )
}
