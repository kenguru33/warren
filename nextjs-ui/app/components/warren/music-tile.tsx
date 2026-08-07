'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BackwardIcon, ForwardIcon, PauseIcon, PlayIcon,
  MusicalNoteIcon, SpeakerWaveIcon, Cog6ToothIcon, TrashIcon,
  ChevronDownIcon, ExclamationTriangleIcon, ArrowTopRightOnSquareIcon,
} from '@heroicons/react/20/solid'
import * as Headless from '@headlessui/react'
import type { MusicSourceView, MusicTargetView, MusicView } from '@/lib/shared/types'
import { BROWSER_TARGET_ID } from '@/lib/shared/types'
import { youtubeMusicUrl } from '@/lib/shared/youtube'
import { DropdownItem, DropdownLabel, DropdownMenu } from '@/app/components/dropdown'
import { TileMenu, type TileMenuItem } from './tile-menu'
import { MusicTargetPicker } from './music-target-picker'
import { browserPlayer, MIN_PLAYER_PX, type BrowserPlayerState } from './browser-player'

function formatTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '--:--'
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

type TileStatus =
  | 'idle' | 'loading' | 'playing' | 'paused'
  | 'target-offline' | 'unknown' | 'error' | 'unsupported'

export function MusicTile({
  music,
  targets,
  onConfigure,
  onRemoveMusic,
  onSetTarget,
  onCommand,
}: {
  music: MusicView
  targets: MusicTargetView[]
  onConfigure: () => void
  onRemoveMusic: () => void
  onSetTarget: (targetId: string) => void
  onCommand: (
    command: string,
    extra?: { sourceId?: number; positionMs?: number; volume?: number },
  ) => Promise<{ target?: string; command?: string; source?: MusicSourceView } | null>
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [local, setLocal] = useState<BrowserPlayerState>(browserPlayer.getState())
  const [busy, setBusy] = useState(false)
  const [commandError, setCommandError] = useState<string | null>(null)

  const targetId = music.preferredTargetId
  const isBrowser = targetId === null || targetId === BROWSER_TARGET_ID
  const ownsPlayer = local.active

  useEffect(() => browserPlayer.subscribe(setLocal), [])

  const sources = music.sources
  const defaultSource = useMemo(
    () => sources.find(s => s.isDefault) ?? sources[0] ?? null,
    [sources],
  )
  const activeSource = useMemo(() => {
    const id = music.playback.sourceId
    return (id !== null ? sources.find(s => s.id === id) : null) ?? defaultSource
  }, [music.playback.sourceId, sources, defaultSource])

  // Browser playback is private to this tab, so its state comes from the local
  // player; cast state is server-held and arrives with the music payload.
  const status: TileStatus = isBrowser
    ? (ownsPlayer ? local.status : 'idle')
    : music.playback.status

  const title = isBrowser && ownsPlayer ? local.title : music.playback.title
  const artist = isBrowser && ownsPlayer ? local.artist : music.playback.artist
  const elapsedMs = isBrowser && ownsPlayer ? local.elapsedMs : music.playback.elapsedMs
  const durationMs = isBrowser && ownsPlayer ? local.durationMs : music.playback.durationMs
  const volume = isBrowser ? local.volume : music.playback.volume ?? 50

  const isActive = status === 'playing' || status === 'paused'
  const showPlayer = isBrowser && ownsPlayer && status !== 'unsupported'

  const run = useCallback(async (fn: () => Promise<void> | void) => {
    setBusy(true)
    setCommandError(null)
    try {
      await fn()
    } catch (err) {
      setCommandError(err instanceof Error ? err.message : 'Command failed')
    } finally {
      setBusy(false)
    }
  }, [])

  const playSource = useCallback((source: MusicSourceView | null) => {
    if (!source) {
      setCommandError('Add a source first')
      return
    }
    void run(async () => {
      if (isBrowser) {
        // Called straight from the click handler so the gesture is preserved.
        const mount = mountRef.current
        if (!mount) throw new Error('player not ready')
        await browserPlayer.play(mount, source)
        return
      }
      await onCommand('play', { sourceId: source.id })
    })
  }, [isBrowser, onCommand, run])

  const togglePlayPause = useCallback(() => {
    if (!isActive) { playSource(activeSource); return }
    void run(async () => {
      if (isBrowser) {
        if (status === 'playing') browserPlayer.pause()
        else browserPlayer.resume()
        return
      }
      await onCommand(status === 'playing' ? 'pause' : 'play')
    })
  }, [isActive, playSource, activeSource, isBrowser, status, onCommand, run])

  const skip = useCallback((direction: 'next' | 'previous') => {
    void run(async () => {
      if (isBrowser) {
        if (direction === 'next') browserPlayer.next()
        else browserPlayer.previous()
        return
      }
      await onCommand(direction)
    })
  }, [isBrowser, onCommand, run])

  const changeVolume = useCallback((value: number) => {
    if (isBrowser) { browserPlayer.setVolume(value); return }
    void run(async () => { await onCommand('volume', { volume: value }) })
  }, [isBrowser, onCommand, run])

  const seekTo = useCallback((positionMs: number) => {
    void run(async () => {
      if (isBrowser) { browserPlayer.seek(positionMs); return }
      await onCommand('seek', { positionMs })
    })
  }, [isBrowser, onCommand, run])

  const handleTargetChange = useCallback((next: string) => {
    // Switching output stops playback on the old target rather than leaving
    // two things playing.
    if (isBrowser && ownsPlayer) browserPlayer.release()
    onSetTarget(next)
  }, [isBrowser, ownsPlayer, onSetTarget])

  const menuItems: TileMenuItem[] = [
    {
      key: 'configure',
      label: 'Configure music…',
      icon: <Cog6ToothIcon data-slot="icon" />,
      onSelect: onConfigure,
    },
    {
      key: 'remove',
      label: 'Remove music',
      icon: <TrashIcon data-slot="icon" />,
      tone: 'destructive',
      onSelect: onRemoveMusic,
    },
  ]

  const statusLine = describeStatus(status, music, commandError, local.error)

  return (
    <div className="group/tile relative flex flex-col gap-3 rounded-xl bg-surface-2 p-3 ring-1 ring-default">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Music</span>
        <TileMenu items={menuItems} aria-label="Music menu" positionClassName="shrink-0" />
      </div>

      {/*
        The embedded player is visible and at least 200x200 — YouTube's terms
        require it and forbid drawing anything over it. It doubles as the tile's
        artwork surface; every control below sits outside this box.
      */}
      <div
        className="relative w-full overflow-hidden rounded-lg bg-default"
        style={{ minHeight: MIN_PLAYER_PX, minWidth: MIN_PLAYER_PX }}
      >
        <div
          ref={mountRef}
          data-testid="music-player-mount"
          className={showPlayer ? 'size-full' : 'hidden'}
          style={{ minHeight: MIN_PLAYER_PX }}
        />
        {!showPlayer && (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted"
               style={{ minHeight: MIN_PLAYER_PX }}>
            {status === 'unsupported' ? (
              <>
                <ExclamationTriangleIcon className="size-8" aria-hidden="true" />
                <p className="px-4 text-center text-xs text-subtle">
                  This browser can&apos;t play the embedded player.
                </p>
                {activeSource && (
                  <a
                    href={youtubeMusicUrl({ kind: activeSource.kind, contentId: activeSource.contentId })}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent-strong underline"
                  >
                    Open in YouTube Music
                    <ArrowTopRightOnSquareIcon className="size-3" aria-hidden="true" />
                  </a>
                )}
              </>
            ) : !isBrowser && isActive ? (
              <SpeakerWaveIcon className="size-10" aria-hidden="true" />
            ) : (
              <MusicalNoteIcon className="size-10" aria-hidden="true" />
            )}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text" data-testid="music-title">
          {title ?? activeSource?.name ?? 'Nothing playing'}
        </p>
        <p className="truncate text-xs text-subtle" data-testid="music-status">
          {artist ?? statusLine}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted">
          {formatTime(elapsedMs)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(durationMs ?? 0, 1)}
          value={Math.min(elapsedMs ?? 0, durationMs ?? 0)}
          onChange={e => seekTo(Number(e.target.value))}
          disabled={!isActive || durationMs === null}
          aria-label="Seek"
          className="slider-sm h-1 flex-1 accent-current disabled:opacity-40"
        />
        <span className="w-9 shrink-0 text-[11px] tabular-nums text-muted">
          {formatTime(durationMs)}
        </span>
      </div>

      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => skip('previous')}
          disabled={!isActive || busy}
          aria-label="Previous track"
          className="rounded-lg p-2 text-subtle hover:bg-surface hover:text-text disabled:opacity-40"
        >
          <BackwardIcon className="size-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={togglePlayPause}
          disabled={busy || status === 'loading' || (!activeSource && !isActive)}
          aria-label={status === 'playing' ? 'Pause' : 'Play'}
          data-testid="music-play-pause"
          className="rounded-full bg-accent-soft p-2.5 text-accent-strong hover:brightness-110 disabled:opacity-40"
        >
          {status === 'playing'
            ? <PauseIcon className="size-5" aria-hidden="true" />
            : <PlayIcon className="size-5" aria-hidden="true" />}
        </button>

        <button
          type="button"
          onClick={() => skip('next')}
          disabled={!isActive || busy}
          aria-label="Next track"
          className="rounded-lg p-2 text-subtle hover:bg-surface hover:text-text disabled:opacity-40"
        >
          <ForwardIcon className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <SpeakerWaveIcon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={e => changeVolume(Number(e.target.value))}
          aria-label="Volume"
          className="slider-sm h-1 flex-1 accent-current"
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-default/60 pt-2 dark:border-white/5">
        <SourcePicker sources={sources} active={activeSource} onPlay={playSource} />
        <MusicTargetPicker
          targets={targets}
          selectedTargetId={targetId}
          onSelect={handleTargetChange}
          disabled={busy}
        />
      </div>

      {status === 'target-offline' && (
        <button
          type="button"
          onClick={() => handleTargetChange(BROWSER_TARGET_ID)}
          className="rounded-lg bg-surface px-2 py-1.5 text-xs text-subtle ring-1 ring-default hover:text-text"
        >
          Switch to this device
        </button>
      )}
    </div>
  )
}

function SourcePicker({
  sources,
  active,
  onPlay,
}: {
  sources: MusicSourceView[]
  active: MusicSourceView | null
  onPlay: (source: MusicSourceView) => void
}) {
  if (sources.length === 0) {
    return <span className="text-xs text-muted">No sources</span>
  }

  return (
    <Headless.Menu>
      <Headless.MenuButton
        aria-label={`Source: ${active?.name ?? 'none'}`}
        className="inline-flex max-w-[55%] items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-subtle hover:bg-surface"
      >
        <MusicalNoteIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{active?.name ?? 'Choose a source'}</span>
        <ChevronDownIcon className="size-3 shrink-0" aria-hidden="true" />
      </Headless.MenuButton>

      <DropdownMenu anchor="bottom start" className="min-w-56">
        {sources.map(source => (
          <DropdownItem key={source.id} onClick={() => onPlay(source)}>
            <MusicalNoteIcon data-slot="icon" />
            <DropdownLabel>
              {source.name}
              {source.isDefault && (
                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted">default</span>
              )}
              {source.unavailable && (
                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-error">unavailable</span>
              )}
              {source.browserOnly && (
                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted">browser only</span>
              )}
            </DropdownLabel>
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Headless.Menu>
  )
}

/** Every non-playing state says what is actually true — never a fabricated idle. */
function describeStatus(
  status: TileStatus,
  music: MusicView,
  commandError: string | null,
  localError: string | null,
): string {
  if (commandError) return commandError
  switch (status) {
    case 'loading':        return 'Starting…'
    case 'playing':        return 'Playing'
    case 'paused':         return 'Paused'
    case 'target-offline': return `${music.playback.targetName ?? 'Speaker'} is offline`
    case 'unknown':        return 'Playback state unknown'
    case 'error':          return music.playback.error ?? localError ?? 'Something went wrong'
    case 'unsupported':    return localError ?? 'Player unavailable'
    default:               return 'Idle'
  }
}
