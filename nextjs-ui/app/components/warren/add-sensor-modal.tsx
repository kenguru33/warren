'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { XMarkIcon } from '@heroicons/react/20/solid'
import type { DiscoveredSensor, SensorType } from '@/lib/shared/types'
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

export interface AddSensorPayload {
  type: SensorType
  sensorId?: number
  deviceId?: string
  label: string
  streamUrl: string
  snapshotUrl: string
}

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json())

const ICONS: Record<string, string> = {
  temperature: '🌡️', humidity: '💧', camera: '📷', motion: '🏃', light: '💡', lightlevel: '☀️',
}
const TYPE_LABELS: Record<string, string> = {
  temperature: 'Temperature', humidity: 'Humidity', camera: 'Camera', motion: 'Motion',
  light: 'Light', lightlevel: 'Light level',
}

const GROUP_ORDER: { type: string; label: string; icon: string }[] = [
  { type: 'light', label: 'Lights', icon: '💡' },
  { type: 'camera', label: 'Cameras', icon: '📷' },
  { type: 'temperature', label: 'Temperature', icon: '🌡️' },
  { type: 'humidity', label: 'Humidity', icon: '💧' },
  { type: 'motion', label: 'Motion', icon: '🏃' },
  { type: 'lightlevel', label: 'Light level', icon: '☀️' },
]

const MANUAL_TYPES: { value: SensorType; icon: string; label: string }[] = [
  { value: 'camera', icon: '📷', label: 'Camera' },
  { value: 'motion', icon: '🏃', label: 'Motion' },
]

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

function keyOf(d: DiscoveredSensor): string {
  return d.sensorId != null ? `sensor:${d.sensorId}` : `${d.deviceId}:${d.sensorType}`
}

function sensorMeta(d: DiscoveredSensor): string {
  const age = d.sensorId ? 'unassigned' : timeAgo(d.lastSeen)
  if (d.sensorType === 'camera' || d.sensorType === 'light') return age
  if (d.latestValue == null) return age
  return `${d.latestValue.toFixed(1)} · ${age}`
}

export function AddSensorModal({
  open,
  roomName,
  onAdd,
  onClose,
}: {
  open: boolean
  roomName: string
  onAdd: (payloads: AddSensorPayload[]) => void
  onClose: () => void
}) {
  const { data: discovered = [], isLoading } = useSWR<DiscoveredSensor[]>(
    open ? '/api/sensors/discovered' : null,
    fetcher,
  )

  const [manual, setManual] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [manualType, setManualType] = useState<SensorType>('camera')
  const [label, setLabel] = useState('')
  const [streamUrl, setStreamUrl] = useState('')
  const [snapshotUrl, setSnapshotUrl] = useState('')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('all')

  // Reset modal state when it (re)opens.
  useEffect(() => {
    if (open) {
      setManual(false)
      setSelectedKeys(new Set())
      setManualType('camera')
      setLabel('')
      setStreamUrl('')
      setSnapshotUrl('')
      setSearch('')
      setActiveFilter('all')
    }
  }, [open])

  const filteredDiscovered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return discovered.filter(d => {
      if (!q) return true
      const hay = [d.label, d.deviceId, d.sensorType, TYPE_LABELS[d.sensorType] ?? '']
      return hay.some(h => (h ?? '').toLowerCase().includes(q))
    })
  }, [discovered, search])

  const groupedDiscovered = useMemo(() => {
    const known = new Set(GROUP_ORDER.map(g => g.type))
    const groups = GROUP_ORDER.map(g => ({ ...g, items: [] as DiscoveredSensor[] }))
    const otherItems: DiscoveredSensor[] = []
    for (const d of filteredDiscovered) {
      if (known.has(d.sensorType)) {
        const group = groups.find(g => g.type === d.sensorType)
        if (group) group.items.push(d)
      } else {
        otherItems.push(d)
      }
    }
    if (otherItems.length) groups.push({ type: 'other', label: 'Other', icon: '📡', items: otherItems })
    return groups.filter(g => g.items.length > 0)
  }, [filteredDiscovered])

  const visibleGroups = activeFilter === 'all'
    ? groupedDiscovered
    : groupedDiscovered.filter(g => g.type === activeFilter)
  const totalCount = filteredDiscovered.length

  const selectedSensors = discovered.filter(d => selectedKeys.has(keyOf(d)))
  const selectedCount = selectedSensors.length
  const canSubmit = manual ? true : selectedCount > 0

  function toggleDevice(d: DiscoveredSensor) {
    const k = keyOf(d)
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    if (manual) {
      onAdd([{
        type: manualType,
        label: label.trim(),
        streamUrl: streamUrl.trim(),
        snapshotUrl: snapshotUrl.trim(),
      }])
    } else if (selectedCount > 0) {
      const useCustomLabel = selectedCount === 1 && label.trim().length > 0
      const payloads: AddSensorPayload[] = selectedSensors.map(d => ({
        type: d.sensorType as SensorType,
        sensorId: d.sensorId,
        deviceId: d.deviceId ?? undefined,
        label: useCustomLabel ? label.trim() : '',
        streamUrl: '',
        snapshotUrl: '',
      }))
      onAdd(payloads)
    }
  }

  const submitLabel = manual
    ? `Add ${(TYPE_LABELS[manualType] ?? manualType).toLowerCase()}`
    : selectedCount === 0
      ? 'Add to room'
      : selectedCount === 1
        ? `Add ${(TYPE_LABELS[selectedSensors[0]!.sensorType] ?? selectedSensors[0]!.sensorType).toLowerCase()}`
        : `Add ${selectedCount} devices`

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <DialogTitle>Add device</DialogTitle>
          <p className="mt-1 text-sm/6 text-muted">to <span className="font-semibold text-text">{roomName}</span></p>
        </div>
        <Button plain aria-label="Close" onClick={onClose}>
          <XMarkIcon data-slot="icon" />
        </Button>
      </div>

      <form className="mt-4 flex flex-col" onSubmit={submit}>
          {!manual ? (
            <>
              <div>
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  type="text"
                  placeholder="Search by name, device ID, type…"
                  autoComplete="off"
                  spellCheck={false}
                  role="searchbox"
                />
              </div>

              {!isLoading && groupedDiscovered.length > 1 && (
                <div className="flex flex-wrap gap-2 items-center pt-4">
                  <button
                    type="button"
                    onClick={() => setActiveFilter('all')}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ring-1 ring-inset',
                      activeFilter === 'all' ? 'bg-accent/10 text-accent-strong ring-accent/30' : 'bg-surface-2 text-muted ring-default hover:text-text hover:ring-accent',
                    ].join(' ')}
                  >
                    All <span className="text-[0.65rem] tabular-nums opacity-70">{totalCount}</span>
                  </button>
                  {groupedDiscovered.map(group => (
                    <button
                      key={group.type}
                      type="button"
                      onClick={() => setActiveFilter(group.type)}
                      className={[
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ring-1 ring-inset',
                        activeFilter === group.type ? 'bg-accent/10 text-accent-strong ring-accent/30' : 'bg-surface-2 text-muted ring-default hover:text-text hover:ring-accent',
                      ].join(' ')}
                    >
                      <span>{group.icon}</span>
                      {group.label}
                      <span className="text-[0.65rem] tabular-nums opacity-70">{group.items.length}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 max-h-[60vh] overflow-y-auto pretty-scroll py-5 flex flex-col gap-6 min-h-[200px]">
                {isLoading ? (
                  <div className="text-center py-12 px-6 text-sm text-subtle">Loading…</div>
                ) : visibleGroups.length > 0 ? (
                  visibleGroups.map(group => (
                    <section key={group.type} className="flex flex-col gap-3">
                      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-subtle">
                        <span>{group.icon}</span>
                        <span>{group.label}</span>
                        <Badge color="zinc" className="ml-auto">{group.items.length}</Badge>
                      </h3>
                      <div className="flex flex-col gap-2">
                        {group.items.map(d => {
                          const k = keyOf(d)
                          const checked = selectedKeys.has(k)
                          return (
                            <button
                              key={k}
                              type="button"
                              role="checkbox"
                              aria-checked={checked}
                              onClick={() => toggleDevice(d)}
                              className={[
                                'flex items-center gap-4 px-4 py-3 rounded-xl ring-1 cursor-pointer text-left transition',
                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                                checked
                                  ? 'bg-accent/10 ring-accent/40'
                                  : 'bg-surface-2/60 ring-default/70 dark:ring-white/5 hover:bg-surface-2 hover:ring-default dark:hover:ring-white/10',
                              ].join(' ')}
                            >
                              <span className="flex size-10 shrink-0 items-center justify-center bg-accent/10 rounded-xl text-lg">
                                {ICONS[d.sensorType] ?? '📡'}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="flex items-center gap-2">
                                  <span className="text-sm text-text font-semibold truncate">
                                    {d.label || d.deviceId || (TYPE_LABELS[d.sensorType] ?? d.sensorType)}
                                  </span>
                                  {d.origin === 'hue' && <Badge color="amber">Hue</Badge>}
                                </span>
                                <span className="block mt-0.5 text-xs text-subtle truncate capitalize">{sensorMeta(d)}</span>
                              </span>
                              <span
                                aria-hidden
                                className={[
                                  'flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset transition-colors',
                                  checked ? 'bg-accent ring-accent text-white' : 'ring-default',
                                ].join(' ')}
                              >
                                {checked && (
                                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                )}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  ))
                ) : search ? (
                  <div className="text-center py-10 text-sm text-subtle">
                    No devices match <strong className="text-muted">&quot;{search}&quot;</strong>.
                  </div>
                ) : (
                  <div className="text-center py-10 px-6 max-w-md mx-auto">
                    <p className="text-base font-semibold text-text">Nothing to discover yet</p>
                    <p className="mt-1 text-sm text-muted">
                      Make sure your devices are powered on. ESP32 sensors publish over MQTT;
                      Hue lights and sensors appear after pairing the bridge.
                    </p>
                  </div>
                )}
              </div>

              {selectedCount === 1 ? (
                <Field className="pt-3 pb-1">
                  <Label>Custom label <span className="text-subtle font-normal">(optional)</span></Label>
                  <Input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder={selectedSensors[0]!.label || selectedSensors[0]!.deviceId || 'Friendly name'}
                    maxLength={60}
                  />
                </Field>
              ) : selectedCount > 1 ? (
                <div className="pt-3 pb-1 text-xs text-subtle">
                  {selectedCount} devices selected — they keep their existing labels (you can rename them later).
                </div>
              ) : null}
            </>
          ) : (
            <div className="pt-5 space-y-4">
              <div>
                <span className="block text-base/6 font-medium text-text select-none sm:text-sm/6">Type</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {MANUAL_TYPES.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setManualType(opt.value)}
                      className={[
                        'flex flex-col items-center gap-1.5 px-2 py-4 rounded-xl ring-1 ring-inset text-sm font-medium transition cursor-pointer',
                        manualType === opt.value
                          ? 'bg-accent/10 text-accent-strong ring-accent/40'
                          : 'bg-surface-2 text-muted ring-default hover:text-text hover:ring-accent',
                      ].join(' ')}
                    >
                      <span className="text-2xl">{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Field>
                <Label>Label <span className="text-subtle font-normal">(optional)</span></Label>
                <Input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="e.g. Front door, Living room…"
                  maxLength={60}
                />
              </Field>

              {manualType === 'camera' && (
                <>
                  <Field>
                    <Label>Stream URL <span className="text-subtle font-normal">(MJPEG / HLS)</span></Label>
                    <Input value={streamUrl} onChange={e => setStreamUrl(e.target.value)} placeholder="http://…" />
                  </Field>
                  <Field>
                    <Label>Snapshot URL <span className="text-subtle font-normal">(optional)</span></Label>
                    <Input value={snapshotUrl} onChange={e => setSnapshotUrl(e.target.value)} placeholder="http://…" />
                  </Field>
                </>
              )}
            </div>
          )}

          <DialogActions>
            <button
              type="button"
              onClick={() => { setManual(m => !m); setSelectedKeys(new Set()) }}
              className="sm:mr-auto text-sm/6 font-medium text-accent-strong hover:underline"
            >
              {manual ? '← Back to discovered devices' : 'Add a camera or motion sensor manually'}
            </button>
            <Button plain type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit}>{submitLabel}</Button>
          </DialogActions>
        </form>
    </Dialog>
  )
}
