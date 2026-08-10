// Module-scoped singleton owning Sonos discovery and the player's Sonos
// playback state. Mirrors ../cast/runtime.ts: boot.ts calls start(), API routes
// drive it, globalThis caching keeps dev HMR from leaking.
//
// It holds much less state than the cast runtime does, and deliberately so. A
// Sonos speaker is authoritative about what it is playing — including audio
// Warren never started — so state is read from the device rather than tracked
// here. What is remembered is only which favorite Warren last started, so the
// tile can show it selected.

import type { MusicPlaybackState, SonosQueueView } from '@/lib/shared/types'
import { getTarget, isReachable, groupRoomsOf, type TargetRow } from '../targets'
import { SonosDiscovery, SONOS_FAKE } from './discovery'
import {
  listFavorites, readState, playFavorite, transport, setVolume,
  listQueue, playQueueIndex, removeQueueEntry, moveQueueEntry,
  type SonosFavorite, type SonosTransport,
} from './control'

/** Matches the cast runtime's cadence; push updates are the real mechanism. */
const SWEEP_INTERVAL_MS = 60_000

interface RuntimeState {
  discovery: SonosDiscovery | null
  sweepTimer: NodeJS.Timeout | null
  /** URI of the favorite Warren last started, for tile selection only. */
  lastFavoriteUri: string | null
  started: boolean
}

declare global {
  var __warren_sonos_state: RuntimeState | undefined
}

function state(): RuntimeState {
  if (!globalThis.__warren_sonos_state) {
    globalThis.__warren_sonos_state = {
      discovery: null, sweepTimer: null, lastFavoriteUri: null, started: false,
    }
  }
  return globalThis.__warren_sonos_state
}

export type SonosCommandResult = { ok: true } | { ok: false; error: string }

function requireTarget(targetId: string): TargetRow | null {
  const target = getTarget(targetId)
  return target && target.protocol === 'sonos' ? target : null
}

function idle(target: TargetRow | null): MusicPlaybackState {
  return {
    status: 'idle',
    targetId: target?.target_id ?? null,
    targetName: target?.friendly_name ?? null,
    sourceId: null,
    title: null,
    artist: null,
    artworkUrl: null,
    elapsedMs: null,
    durationMs: null,
    volume: null,
    error: null,
    updatedAt: Date.now(),
  }
}

/**
 * Playback state for a Sonos target, read from the speaker.
 *
 * A speaker we cannot read is `unknown`, never `idle` — the same rule the cast
 * runtime follows, and for the same reason: rendering an unreadable device as
 * idle is a lie the user acts on.
 */
async function getState(targetId: string): Promise<MusicPlaybackState> {
  const target = requireTarget(targetId)
  if (!target) return idle(null)

  if (!isReachable(target)) {
    return { ...idle(target), status: 'target-offline' }
  }

  const result = await readState(target)
  if (!result.ok) {
    return { ...idle(target), status: 'unknown', error: result.error }
  }

  const now = result.value
  return {
    status: now.status,
    targetId: target.target_id,
    targetName: target.friendly_name,
    sourceId: null,
    title: now.title,
    artist: now.artist,
    artworkUrl: now.artworkUrl,
    elapsedMs: now.elapsedMs,
    durationMs: now.durationMs,
    volume: now.volume,
    error: null,
    updatedAt: Date.now(),
  }
}

async function favorites(targetId: string): Promise<{ ok: true; value: SonosFavorite[] } | { ok: false; error: string }> {
  const target = requireTarget(targetId)
  if (!target) return { ok: false, error: 'Not a Sonos target' }
  if (!isReachable(target)) return { ok: false, error: 'Speaker is offline' }
  return listFavorites(target)
}

async function play(targetId: string, favoriteId: string): Promise<SonosCommandResult> {
  const target = requireTarget(targetId)
  if (!target) return { ok: false, error: 'Not a Sonos target' }
  if (!isReachable(target)) return { ok: false, error: 'Speaker is offline' }

  const list = await listFavorites(target)
  if (!list.ok) return { ok: false, error: list.error }

  const favorite = list.value.find(f => f.id === favoriteId)
  // Favorites live in the Sonos app and can vanish between the picker being
  // rendered and the user pressing play. Say so rather than failing obscurely.
  if (!favorite) return { ok: false, error: 'That favorite is no longer in Sonos' }

  const result = await playFavorite(target, favorite)
  if (!result.ok) return { ok: false, error: result.error }

  state().lastFavoriteUri = favorite.uri
  return { ok: true }
}

async function command(targetId: string, cmd: SonosTransport): Promise<SonosCommandResult> {
  const target = requireTarget(targetId)
  if (!target) return { ok: false, error: 'Not a Sonos target' }
  if (!isReachable(target)) return { ok: false, error: 'Speaker is offline' }

  const result = await transport(target, cmd)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

async function volume(targetId: string, value: number): Promise<SonosCommandResult> {
  const target = requireTarget(targetId)
  if (!target) return { ok: false, error: 'Not a Sonos target' }
  if (!isReachable(target)) return { ok: false, error: 'Speaker is offline' }

  const result = await setVolume(target, value)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

/**
 * The queue, with the same guards every other Sonos read gets.
 */
async function queue(targetId: string): Promise<{ ok: true; value: SonosQueueView } | { ok: false; error: string }> {
  const target = requireTarget(targetId)
  if (!target) return { ok: false, error: 'Not a Sonos target' }
  if (!isReachable(target)) return { ok: false, error: 'Speaker is offline' }
  return listQueue(target)
}

export type QueueAction = 'play' | 'remove' | 'move'

/**
 * Mutate the queue and return the re-read result.
 *
 * Returning the fresh list rather than an ok is deliberate: indices shift on
 * every mutation, and any Sonos client can change the queue at the same time,
 * so a client holding an optimistic list would act on positions that no longer
 * mean what it thinks.
 */
async function mutateQueue(
  targetId: string,
  action: QueueAction,
  index: number,
  toIndex?: number,
): Promise<{ ok: true; value: SonosQueueView } | { ok: false; error: string }> {
  const target = requireTarget(targetId)
  if (!target) return { ok: false, error: 'Not a Sonos target' }
  if (!isReachable(target)) return { ok: false, error: 'Speaker is offline' }

  const result =
    action === 'play' ? await playQueueIndex(target, index)
    : action === 'remove' ? await removeQueueEntry(target, index)
    : await moveQueueEntry(target, index, toIndex ?? index)

  if (!result.ok) return { ok: false, error: result.error }
  return listQueue(target)
}

export const sonosRuntime = {
  start() {
    const s = state()
    if (s.started) return
    s.started = true

    s.discovery = new SonosDiscovery()
    // Discovery is async and may find nothing; never let it reject into boot.
    void s.discovery.start().catch(err => console.error('[sonos] start failed:', err))

    s.sweepTimer = setInterval(() => {
      s.discovery?.sweep().catch(err => console.error('[sonos] sweep failed:', err))
    }, SWEEP_INTERVAL_MS)

    console.log(`[sonos] runtime started${SONOS_FAKE ? ' (fake)' : ''}`)
  },

  stop() {
    const s = state()
    if (s.sweepTimer) clearInterval(s.sweepTimer)
    s.sweepTimer = null

    const discovery = s.discovery
    s.discovery = null
    s.started = false
    s.lastFavoriteUri = null

    void discovery?.stop().catch(() => { /* already gone */ })
  },

  sweepNow() {
    return state().discovery?.sweep() ?? Promise.resolve()
  },

  getState,
  favorites,
  queue,
  mutateQueue,
  play,
  command,
  volume,
  groupRoomsOf,
}
