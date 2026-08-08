'use client'

import { useState } from 'react'
import {
  ArrowDownIcon, ArrowUpIcon, StarIcon, TrashIcon, PlusIcon,
} from '@heroicons/react/20/solid'
import type { MusicSourceView, MusicTargetView, MusicView } from '@/lib/shared/types'
import { MAX_MUSIC_SOURCES } from '@/lib/shared/types'
import { parseYouTubeMusicUrl, YOUTUBE_URL_HELP } from '@/lib/shared/youtube'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/app/components/dialog'
import { Button } from '@/app/components/button'
import { Field, Label, ErrorMessage, Description } from '@/app/components/fieldset'
import { Input } from '@/app/components/input'
import { Text } from '@/app/components/text'

export function MusicConfigModal({
  open,
  music,
  targets,
  onClose,
  onAddSource,
  onPatchSource,
  onDeleteSource,
  onAddManualTarget,
  onRemoveTarget,
  onRemoveMusic,
}: {
  open: boolean
  music: MusicView
  targets: MusicTargetView[]
  onClose: () => void
  onAddSource: (url: string, name: string) => Promise<MusicSourceView>
  onPatchSource: (id: number, patch: { name?: string; isDefault?: boolean; position?: number }) => Promise<void>
  onDeleteSource: (id: number) => Promise<void>
  onAddManualTarget: (address: string, friendlyName?: string) => Promise<void>
  onRemoveTarget: (targetId: string) => Promise<void>
  onRemoveMusic: () => void
}) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [manualIp, setManualIp] = useState('')
  const [manualName, setManualName] = useState('')
  const [targetError, setTargetError] = useState<string | null>(null)

  const sources = music.sources
  const atCapacity = sources.length >= MAX_MUSIC_SOURCES

  async function addSource() {
    setSourceError(null)

    // Validate before the round trip so a bad paste is rejected at the point of
    // entry — the input keeps its value so nothing is retyped.
    if (!parseYouTubeMusicUrl(url)) {
      setSourceError(YOUTUBE_URL_HELP)
      return
    }
    if (!name.trim()) {
      setSourceError('Give this source a name so you can recognize it later.')
      return
    }

    setBusy(true)
    try {
      await onAddSource(url, name)
      setUrl('')
      setName('')
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : 'Could not add this source')
    } finally {
      setBusy(false)
    }
  }

  async function addTarget() {
    setTargetError(null)
    setBusy(true)
    try {
      await onAddManualTarget(manualIp, manualName || undefined)
      setManualIp('')
      setManualName('')
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : 'Could not add this speaker')
    } finally {
      setBusy(false)
    }
  }

  async function move(source: MusicSourceView, delta: number) {
    const ordered = [...sources].sort((a, b) => a.position - b.position)
    const index = ordered.findIndex(s => s.id === source.id)
    const swapWith = ordered[index + delta]
    if (!swapWith) return
    await onPatchSource(source.id, { position: swapWith.position })
    await onPatchSource(swapWith.id, { position: source.position })
  }

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>Music</DialogTitle>

      <DialogBody className="space-y-8">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-text">Sources</h3>

          {sources.length === 0 ? (
            <Text>No sources yet. Add a playlist, album or song below.</Text>
          ) : (
            <ul className="divide-y divide-default/60 rounded-lg ring-1 ring-default dark:divide-white/5">
              {[...sources].sort((a, b) => a.position - b.position).map((source, index, all) => (
                <li key={source.id} className="flex items-center gap-2 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text">
                      {source.name}
                      {source.isDefault && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-accent-strong">default</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {source.kind}
                      {source.unavailable && ' · unavailable'}
                      {source.browserOnly && ' · plays on this device only'}
                    </p>
                  </div>

                  <Button plain onClick={() => move(source, -1)} disabled={index === 0 || busy} aria-label="Move up">
                    <ArrowUpIcon data-slot="icon" />
                  </Button>
                  <Button plain onClick={() => move(source, 1)} disabled={index === all.length - 1 || busy} aria-label="Move down">
                    <ArrowDownIcon data-slot="icon" />
                  </Button>
                  <Button
                    plain
                    onClick={() => onPatchSource(source.id, { isDefault: true })}
                    disabled={source.isDefault || busy}
                    aria-label="Make default"
                  >
                    <StarIcon data-slot="icon" />
                  </Button>
                  <Button plain onClick={() => onDeleteSource(source.id)} disabled={busy} aria-label={`Delete ${source.name}`}>
                    <TrashIcon data-slot="icon" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {atCapacity ? (
            <Text>
              The library holds the maximum of {MAX_MUSIC_SOURCES} sources. Remove one to add another.
            </Text>
          ) : (
            <div className="space-y-3 rounded-lg bg-surface-2 p-3">
              <Field>
                <Label>YouTube Music link</Label>
                <Input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://music.youtube.com/playlist?list=…"
                  data-testid="music-source-url"
                />
              </Field>
              <Field>
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Dinner"
                  maxLength={60}
                  data-testid="music-source-name"
                />
                <Description>Shown in the tile&apos;s source list.</Description>
              </Field>
              {sourceError && <ErrorMessage data-testid="music-source-error">{sourceError}</ErrorMessage>}
              <Button onClick={addSource} disabled={busy} data-testid="music-source-add">
                <PlusIcon data-slot="icon" />
                Add source
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-text">Speakers</h3>
          <Text>
            Speakers on your network are found automatically. Add one by IP address if
            it doesn&apos;t appear — some networks don&apos;t pass the discovery traffic through.
          </Text>

          {targets.length > 0 && (
            <ul className="divide-y divide-default/60 rounded-lg ring-1 ring-default dark:divide-white/5">
              {targets.map(target => (
                <li key={target.targetId} className="flex items-center gap-2 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text">{target.friendlyName}</p>
                    <p className="truncate text-xs text-muted">
                      {target.origin === 'manual' ? 'added manually' : 'discovered'}
                      {!target.reachable && ' · offline'}
                    </p>
                  </div>
                  {target.origin === 'manual' && (
                    <Button plain onClick={() => onRemoveTarget(target.targetId)} disabled={busy} aria-label={`Remove ${target.friendlyName}`}>
                      <TrashIcon data-slot="icon" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 rounded-lg bg-surface-2 p-3">
            <Field>
              <Label>Speaker IP address</Label>
              <Input value={manualIp} onChange={e => setManualIp(e.target.value)} placeholder="192.168.1.42" />
            </Field>
            <Field>
              <Label>Name (optional)</Label>
              <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Kitchen" maxLength={60} />
            </Field>
            {targetError && <ErrorMessage>{targetError}</ErrorMessage>}
            <Button outline onClick={addTarget} disabled={busy || !manualIp}>
              <PlusIcon data-slot="icon" />
              Add speaker
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-text">Remove music</h3>
          <Text>
            Stops playback and deletes the whole source library. Speakers stay available.
          </Text>
          <Button color="red" onClick={onRemoveMusic} disabled={busy}>
            <TrashIcon data-slot="icon" />
            Remove music
          </Button>
        </section>
      </DialogBody>

      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}
