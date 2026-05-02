'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  Cog6ToothIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/20/solid'
import { Badge } from '@/app/components/badge'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/app/components/dialog'
import { Description, Field, Label } from '@/app/components/fieldset'
import { Heading } from '@/app/components/heading'
import { Input } from '@/app/components/input'
import { Text } from '@/app/components/text'
import { SwitchField } from '@/app/components/switch'
import { AppSwitch } from '@/app/components/warren/app-switch'
import { ConfirmDialog } from '@/app/components/warren/confirm-dialog'
import { SensorConfigModal } from '@/app/components/warren/sensor-config-modal'

interface SensorRow {
  id: number | null
  deviceId: string | null
  type: string
  label: string | null
  roomId: number | null
  roomName: string | null
  lastRecordedAt: number | null
  heaterActive: boolean | null
  fanActive: boolean | null
  latestValue?: number | null
  lightOn?: boolean | null
}

const TYPE_ICONS: Record<string, string> = {
  temperature: '🌡️', humidity: '💧', camera: '📷', motion: '🏃', light: '💡', lightlevel: '☀️',
}
const TYPE_LABELS: Record<string, string> = {
  temperature: 'Temperature', humidity: 'Humidity', camera: 'Camera', motion: 'Motion',
  light: 'Light', lightlevel: 'Light Level',
}

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json())

function matchesSearch(haystacks: (string | null | undefined)[], needle: string): boolean {
  if (!needle) return true
  const q = needle.toLowerCase()
  return haystacks.some(h => h?.toLowerCase().includes(q))
}

function formatValue(s: { type: string; latestValue: number | null; lightOn?: boolean | null }): string {
  if (s.type === 'light') return s.lightOn ? 'On' : 'Off'
  if (s.latestValue === null) return '—'
  if (s.type === 'temperature') return `${s.latestValue}°C`
  if (s.type === 'humidity') return `${s.latestValue}%`
  if (s.type === 'motion') return s.latestValue === 1 ? 'Detected' : 'Clear'
  if (s.type === 'lightlevel') return `${Math.round(s.latestValue)} lx`
  return '—'
}

export default function SensorsPage() {
  const { data: sensors = [], mutate: refresh } = useSWR<SensorRow[]>('/api/sensors', fetcher, { refreshInterval: 30_000 })
  const { data: blocked = [], mutate: refreshBlocked } = useSWR<{ deviceId: string; type: string }[]>(
    '/api/sensors/blocked', fetcher, { refreshInterval: 30_000 },
  )

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])

  const [onlyUnused, setOnlyUnused] = useState(false)
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<SensorRow | null>(null)
  const [configuringSensor, setConfiguringSensor] = useState<SensorRow | null>(null)
  const [editingSensor, setEditingSensor] = useState<SensorRow | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  const nonLightSensors = useMemo(() => sensors.filter(s => s.type !== 'light'), [sensors])
  const visibleSensors = useMemo(() => {
    let list = nonLightSensors
    if (onlyUnused) list = list.filter(s => !s.roomName)
    return list.filter(s => matchesSearch([s.label, s.deviceId, s.roomName, TYPE_LABELS[s.type], s.type], search))
  }, [nonLightSensors, onlyUnused, search])

  const visibleBlocked = useMemo(() => (
    blocked.filter(b => b.type !== 'light').filter(b => matchesSearch([b.deviceId, TYPE_LABELS[b.type], b.type], search))
  ), [blocked, search])

  function isOffline(ms: number | null): boolean {
    if (!ms) return true
    return now - ms > 30_000
  }

  function formatAge(ms: number | null) {
    if (!ms) return 'Never'
    const diff = Math.round((now - ms) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
    return `${Math.round(diff / 86400)}d ago`
  }

  async function confirmDelete() {
    const sensor = pendingDelete
    if (!sensor) return
    if (sensor.id !== null) {
      await fetch(`/api/sensors/${sensor.id}`, { method: 'DELETE', credentials: 'include' })
    } else if (sensor.deviceId) {
      await fetch('/api/sensors/block', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ deviceId: sensor.deviceId, type: sensor.type }),
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

  function openEdit(sensor: SensorRow) {
    if (sensor.id === null) return
    setEditingSensor(sensor)
    setEditingLabel(sensor.label ?? '')
  }

  async function saveEdit() {
    const sensor = editingSensor
    if (!sensor?.id) return
    await fetch(`/api/sensors/${sensor.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ label: editingLabel.trim() || null }),
    })
    setEditingSensor(null)
    await refresh()
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Heading>Sensors</Heading>
            <Text className="mt-1">Manage every sensor connected to Warren.</Text>
          </div>
          <div className="flex items-center gap-4">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              type="search"
              className="min-w-[220px]"
              placeholder="Search sensors…"
            />
            <SwitchField className="!grid-cols-[auto_auto] !gap-x-3">
              <Label>Unused only</Label>
              <AppSwitch checked={onlyUnused} onChange={setOnlyUnused} label="Show only unused" />
            </SwitchField>
          </div>
        </div>

        {visibleSensors.length === 0 ? (
          <div className="rounded-xl bg-surface ring-1 ring-default shadow-sm dark:ring-white/10 dark:shadow-none p-12 text-center text-sm text-muted">
            {onlyUnused ? 'No unused sensors.' : 'No sensors registered yet.'}
          </div>
        ) : (
          <ul role="list" className="rounded-xl bg-surface ring-1 ring-default shadow-sm dark:ring-white/10 dark:shadow-none divide-y divide-default dark:divide-white/10 overflow-hidden">
            {visibleSensors.map((sensor, i) => (
              <li
                key={sensor.id ?? `${sensor.deviceId}:${sensor.type}:${i}`}
                className="group/row flex items-center gap-x-4 px-5 py-4 transition-colors hover:bg-default/50 dark:hover:bg-white/[0.02]"
              >
                <div className="flex size-10 flex-none items-center justify-center rounded-lg bg-surface-2 text-lg dark:bg-white/5">
                  {TYPE_ICONS[sensor.type] ?? '?'}
                </div>

                <div className="min-w-0 flex-auto">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm/6 font-semibold text-text truncate">
                      {sensor.label || TYPE_LABELS[sensor.type] || sensor.type}
                    </p>
                    {sensor.type !== 'camera' && isOffline(sensor.lastRecordedAt) && (
                      <Badge color="red">Offline</Badge>
                    )}
                    {!sensor.roomName && <Badge color="zinc">Unassigned</Badge>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs/5 text-subtle truncate">
                    {sensor.label && <span>{TYPE_LABELS[sensor.type] || sensor.type}</span>}
                    {sensor.label && sensor.roomName && <span aria-hidden>·</span>}
                    {sensor.roomName && <span>{sensor.roomName}</span>}
                    {sensor.deviceId && <span aria-hidden>·</span>}
                    {sensor.deviceId && <span className="font-mono">{sensor.deviceId}</span>}
                  </div>
                </div>

                <div className="hidden shrink-0 sm:flex flex-col items-end w-24 text-right">
                  <span className={`text-sm/6 font-semibold tabular-nums ${sensor.type !== 'camera' && isOffline(sensor.lastRecordedAt) ? 'text-subtle' : 'text-text'}`}>
                    {formatValue({ type: sensor.type, latestValue: sensor.latestValue ?? null, lightOn: sensor.lightOn })}
                  </span>
                  <span className="text-xs/5 text-subtle tabular-nums">{formatAge(sensor.lastRecordedAt)}</span>
                  {sensor.type === 'temperature' && (
                    // Heater = orange, fan = sky. Same fixed indicator colors as
                    // ClimateTile — physical meaning is scheme-independent.
                    <div className="mt-1 flex gap-1">
                      <span className={`inline-flex items-center transition-colors ${sensor.heaterActive ? 'text-orange-500' : 'text-subtle/60'}`} title="Heater">
                        <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                          <path d="M3 6 Q6 3 9 6 Q12 9 15 6 Q18 3 21 6"/>
                          <path d="M3 12 Q6 9 9 12 Q12 15 15 12 Q18 9 21 12"/>
                          <path d="M3 18 Q6 15 9 18 Q12 21 15 18 Q18 15 21 18"/>
                        </svg>
                      </span>
                      <span className={`inline-flex items-center transition-colors ${sensor.fanActive ? 'text-sky-400' : 'text-subtle/60'}`} title="Fan">
                        <svg className="size-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6.93-1A7 7 0 0 0 13 4.07V2h-2v2.07A7 7 0 0 0 5.07 10H3v2h2.07A7 7 0 0 0 11 19.93V22h2v-2.07A7 7 0 0 0 18.93 13H21v-2h-2.07zM12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/></svg>
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex w-[108px] shrink-0 items-center justify-end gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100">
                  {sensor.type === 'temperature' && sensor.deviceId && (
                    <Button plain title="Configure" aria-label="Configure" onClick={() => setConfiguringSensor(sensor)}>
                      <Cog6ToothIcon data-slot="icon" />
                    </Button>
                  )}
                  {sensor.id !== null && (
                    <Button plain title="Edit" aria-label="Edit" onClick={() => openEdit(sensor)}>
                      <PencilSquareIcon data-slot="icon" />
                    </Button>
                  )}
                  <Button plain title="Remove" aria-label="Remove" onClick={() => setPendingDelete(sensor)}>
                    <TrashIcon data-slot="icon" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {visibleBlocked.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">
              Hidden sensors ({visibleBlocked.length})
            </h2>
            <ul role="list" className="rounded-2xl ring-1 ring-default/70 dark:ring-white/5 divide-y divide-default">
              {visibleBlocked.map(b => (
                <li key={`${b.deviceId}:${b.type}`} className="flex items-center gap-4 px-5 py-3 first:rounded-t-2xl last:rounded-b-2xl bg-surface-2/60">
                  <span className="text-base">{TYPE_ICONS[b.type] ?? '?'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-muted">{TYPE_LABELS[b.type] || b.type}</div>
                    <div className="text-xs text-subtle font-mono truncate">{b.deviceId}</div>
                  </div>
                  <Button outline onClick={() => restoreBlocked(b)}>Restore</Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {configuringSensor?.deviceId && (
        <SensorConfigModal
          open
          deviceId={configuringSensor.deviceId}
          label={configuringSensor.label}
          onClose={() => setConfiguringSensor(null)}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        message={
          pendingDelete?.id === null
            ? `Hide sensor "${pendingDelete?.label || TYPE_LABELS[pendingDelete?.type ?? ''] || pendingDelete?.type}"? You can restore it from the Hidden sensors section below.`
            : `Delete sensor "${pendingDelete?.label || TYPE_LABELS[pendingDelete?.type ?? ''] || pendingDelete?.type}"?`
        }
        confirmLabel={pendingDelete?.id === null ? 'Hide' : 'Delete'}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <Dialog open={!!editingSensor} onClose={() => setEditingSensor(null)} size="md">
        {editingSensor && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{TYPE_ICONS[editingSensor.type] ?? '?'}</span>
              <div>
                <DialogTitle>{TYPE_LABELS[editingSensor.type] || editingSensor.type}</DialogTitle>
                {editingSensor.deviceId && (
                  <div className="mt-0.5 font-mono text-xs text-subtle">{editingSensor.deviceId}</div>
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
                    if (e.key === 'Escape') setEditingSensor(null)
                  }}
                  placeholder="Custom label…"
                  maxLength={60}
                  autoFocus
                />
              </Field>
            </DialogBody>
            <DialogActions>
              <Button plain type="button" onClick={() => setEditingSensor(null)}>Cancel</Button>
              <Button type="button" onClick={saveEdit}>Save</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  )
}
