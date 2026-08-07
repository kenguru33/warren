// Module-scoped singleton owning cast discovery, device connections and the
// player's cast playback state. Mirrors lib/server/hue/runtime.ts: boot.ts
// calls start(), API routes drive it, globalThis caching keeps dev HMR from
// leaking.
//
// Unlike the Hue runtime this owns TLS sockets as well as timers. Leaking a
// socket is worse than leaking a timer — the Cast device holds it open and
// eventually refuses new senders — so stop() must close everything.
//
// Music is one global player, so there is exactly one playback state and one
// active output. Moving playback to another speaker closes the previous
// device's session rather than leaving two streams running.
//
// Browser playback is NOT tracked here. It is private to the browser tab that
// started it and no other client can observe or control it, so the server
// reports the browser target as idle rather than inventing shared state.

import type { MusicPlaybackState } from '@/lib/shared/types'
import { getDb } from '../db'
import {
  CastConnection, YOUTUBE_APP_ID,
  type MediaStatus, type ReceiverApplication, type ReceiverStatus,
} from './connection'
import { startContent, type LoungeSessionInfo } from './lounge'
import { CastDiscovery, CAST_FAKE, getTarget, isReachable, type TargetRow } from './discovery'

const SWEEP_INTERVAL_MS = 60_000
/** Backstop only — real updates arrive by push over the CASTV2 socket. */
const RECONCILE_INTERVAL_MS = 10_000

interface DeviceSession {
  targetId: string
  /** Null under WARREN_CAST_FAKE, where there is no real device to talk to. */
  connection: CastConnection | null
  app: ReceiverApplication | null
  screenId: string | null
  lounge: LoungeSessionInfo | null
  media: MediaStatus | null
  volume: number | null
}

interface Playback {
  targetId: string
  sourceId: number | null
  status: MusicPlaybackState['status']
  error: string | null
  updatedAt: number
}

interface RuntimeState {
  discovery: CastDiscovery | null
  sweepTimer: NodeJS.Timeout | null
  reconcileTimer: NodeJS.Timeout | null
  sessions: Map<string, DeviceSession>
  /**
   * There is one player for the house, so there is one playback state. The
   * per-room map this replaced also needed a targetId → roomId owners map to
   * arbitrate two rooms fighting over one speaker; a single player cannot
   * contend with itself, so both are gone.
   */
  playback: Playback | null
  started: boolean
}

declare global {
  var __warren_cast_state: RuntimeState | undefined
}

function state(): RuntimeState {
  if (!globalThis.__warren_cast_state) {
    globalThis.__warren_cast_state = {
      discovery: null,
      sweepTimer: null,
      reconcileTimer: null,
      sessions: new Map(),
      playback: null,
      started: false,
    }
  }
  return globalThis.__warren_cast_state
}

function idleState(targetId: string | null, targetName: string | null): MusicPlaybackState {
  return {
    status: 'idle',
    targetId,
    targetName,
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

// ---------------------------------------------------------------------------
// Device sessions
// ---------------------------------------------------------------------------

async function openSession(target: TargetRow): Promise<DeviceSession> {
  const s = state()
  const existing = s.sessions.get(target.target_id)
  // Under the fake there is no socket to check liveness on — reuse the stub.
  if (existing && (CAST_FAKE || existing.connection?.isOpen)) return existing

  if (CAST_FAKE) {
    const fake: DeviceSession = {
      targetId: target.target_id,
      connection: null,
      app: { appId: YOUTUBE_APP_ID, sessionId: 'fake-session', transportId: 'fake-transport' },
      screenId: 'fake-screen',
      lounge: null,
      media: null,
      volume: 0.5,
    }
    s.sessions.set(target.target_id, fake)
    return fake
  }

  const connection = new CastConnection(target.address, target.port)
  await connection.connect()

  const session: DeviceSession = {
    targetId: target.target_id,
    connection,
    app: null,
    screenId: null,
    lounge: null,
    media: null,
    volume: null,
  }

  connection.on('mediaStatus', (media: MediaStatus | null) => {
    session.media = media
    touchPlaybackFor(target.target_id)
  })
  connection.on('receiverStatus', (status: ReceiverStatus) => {
    session.volume = status.volumeLevel
    const app = status.applications.find(a => a.appId === YOUTUBE_APP_ID)
    if (!app) {
      // The YouTube app went away — something else took the device.
      session.app = null
      session.media = null
    }
    touchPlaybackFor(target.target_id)
  })
  connection.on('close', () => {
    s.sessions.delete(target.target_id)
    markTargetOffline(target.target_id)
  })

  s.sessions.set(target.target_id, session)
  return session
}

function closeSession(targetId: string) {
  const s = state()
  const session = s.sessions.get(targetId)
  if (!session) return
  s.sessions.delete(targetId)
  try { session.connection?.destroy(null) } catch { /* already closed */ }
}

function touchPlaybackFor(targetId: string) {
  const s = state()
  if (s.playback?.targetId === targetId) s.playback.updatedAt = Date.now()
}

function markTargetOffline(targetId: string) {
  const s = state()
  if (s.playback?.targetId === targetId) {
    s.playback.status = 'target-offline'
    s.playback.updatedAt = Date.now()
  }
}

/** Drop connections the player no longer references. */
function pruneSessions() {
  const s = state()
  const referenced = s.playback?.targetId
  for (const targetId of [...s.sessions.keys()]) {
    if (targetId !== referenced) closeSession(targetId)
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export interface PlayRequest {
  targetId: string
  sourceId: number
  kind: 'playlist' | 'album' | 'track'
  contentId: string
}

export type CommandResult =
  | { ok: true }
  | { ok: false; error: string; browserOnly?: boolean }

async function play(req: PlayRequest): Promise<CommandResult> {
  const s = state()
  const target = getTarget(req.targetId)
  if (!target) return { ok: false, error: 'Unknown target' }
  if (!isReachable(target)) return { ok: false, error: 'Target offline' }

  // Starting playback replaces whatever the single player was doing, including
  // on a different speaker — switching output is a move, not a second stream.
  if (s.playback && s.playback.targetId !== req.targetId) {
    closeSession(s.playback.targetId)
  }

  s.playback = {
    targetId: req.targetId,
    sourceId: req.sourceId,
    status: 'loading',
    error: null,
    updatedAt: Date.now(),
  }

  try {
    const session = await openSession(target)

    if (CAST_FAKE) {
      session.media = {
        mediaSessionId: 1,
        playerState: 'PLAYING',
        currentTimeMs: 0,
        durationMs: 210_000,
        title: 'Fake track',
        artist: 'Warren test',
        artworkUrl: null,
      }
      setStatus('playing')
      return { ok: true }
    }

    if (!session.connection) return { ok: false, error: 'Target offline' }

    const app = await session.connection.launchYouTube()
    session.app = app
    session.screenId = await session.connection.getScreenId(app.transportId)

    const started = await startContent(session.screenId, {
      listId: req.kind === 'track' ? undefined : req.contentId,
      videoId: req.kind === 'track' ? req.contentId : undefined,
    })

    if (!started.ok) {
      // A source that will not resolve anonymously is browser-only, not broken.
      setStatus('error', started.error)
      return { ok: false, error: started.error, browserOnly: true }
    }

    session.lounge = started.value
    setStatus('playing')
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cast command failed'
    setStatus('error', message)
    return { ok: false, error: message }
  }
}

function setStatus(status: MusicPlaybackState['status'], error: string | null = null) {
  const playback = state().playback
  if (!playback) return
  playback.status = status
  playback.error = error
  playback.updatedAt = Date.now()
}

export type TransportCommand = 'play' | 'pause' | 'next' | 'previous' | 'stop'

async function transport(command: TransportCommand): Promise<CommandResult> {
  const s = state()
  const playback = s.playback
  if (!playback) return { ok: false, error: 'Nothing is playing' }

  const session = s.sessions.get(playback.targetId)
  if (!session) return { ok: false, error: 'Target offline' }

  if (CAST_FAKE) {
    // Mirror what a real device would push back, since getState trusts the
    // device's reported playerState over the locally-set status.
    if (command === 'pause') {
      setStatus('paused')
      if (session.media) session.media = { ...session.media, playerState: 'PAUSED' }
    }
    if (command === 'play') {
      setStatus('playing')
      if (session.media) session.media = { ...session.media, playerState: 'PLAYING' }
    }
    if (command === 'stop') {
      s.playback = null
      session.media = null
    }
    return { ok: true }
  }

  if (!session.connection || !session.app || !session.media) {
    return { ok: false, error: 'Device state unknown' }
  }

  const mapped = {
    play: 'PLAY', pause: 'PAUSE', next: 'QUEUE_NEXT',
    previous: 'QUEUE_PREV', stop: 'STOP',
  } as const

  try {
    await session.connection.mediaCommand(
      session.app.transportId,
      session.media.mediaSessionId,
      mapped[command],
    )
    if (command === 'stop') {
      s.playback = null
      pruneSessions()
    }
    return { ok: true }
  } catch (err) {
    // Re-read rather than assume the command took effect.
    const message = err instanceof Error ? err.message : 'Command failed'
    void refresh(playback.targetId)
    return { ok: false, error: message }
  }
}

async function seek(positionMs: number): Promise<CommandResult> {
  const s = state()
  const playback = s.playback
  const session = playback ? s.sessions.get(playback.targetId) : null
  if (!playback || !session) return { ok: false, error: 'Nothing is playing' }
  if (CAST_FAKE) return { ok: true }
  if (!session.connection || !session.app || !session.media) {
    return { ok: false, error: 'Device state unknown' }
  }

  try {
    await session.connection.seek(session.app.transportId, session.media.mediaSessionId, positionMs / 1000)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Seek failed' }
  }
}

async function setVolume(volume: number): Promise<CommandResult> {
  const s = state()
  const playback = s.playback
  if (!playback) return { ok: false, error: 'Nothing is playing' }

  const clamped = Math.max(0, Math.min(100, Math.round(volume)))
  getDb().prepare(`
    INSERT INTO music_volume (target_id, volume) VALUES (?, ?)
    ON CONFLICT(target_id) DO UPDATE SET volume = excluded.volume
  `).run(playback.targetId, clamped)

  const session = s.sessions.get(playback.targetId)
  if (CAST_FAKE) {
    if (session) session.volume = clamped / 100
    return { ok: true }
  }
  if (!session?.connection) return { ok: false, error: 'Target offline' }

  try {
    await session.connection.setVolume(clamped / 100)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Volume change failed' }
  }
}

async function refresh(targetId: string) {
  const session = state().sessions.get(targetId)
  if (!session?.app || !session.connection || CAST_FAKE) return
  try {
    session.media = await session.connection.getMediaStatus(session.app.transportId)
  } catch {
    markTargetOffline(targetId)
  }
}

/** Called when music config is deleted or the output target changes. */
function release() {
  const s = state()
  if (!s.playback) return
  s.playback = null
  pruneSessions()
}

// ---------------------------------------------------------------------------
// State projection
// ---------------------------------------------------------------------------

function getState(preferredTargetId: string | null): MusicPlaybackState {
  const s = state()
  const playback = s.playback

  if (!playback) {
    const target = preferredTargetId ? getTarget(preferredTargetId) : null
    if (preferredTargetId && !target) return idleState(preferredTargetId, null)
    if (target && !isReachable(target)) {
      return { ...idleState(target.target_id, target.friendly_name), status: 'target-offline' }
    }
    return idleState(target?.target_id ?? null, target?.friendly_name ?? null)
  }

  const target = getTarget(playback.targetId)
  const session = s.sessions.get(playback.targetId)
  const media = session?.media ?? null

  // A cast target whose state we cannot read is `unknown` — never idle, and
  // never a stale snapshot presented as current.
  let status = playback.status
  if (status === 'playing' || status === 'paused') {
    if (!session) status = 'target-offline'
    else if (!media && !CAST_FAKE) status = 'unknown'
    else if (media) status = media.playerState === 'PAUSED' ? 'paused' : 'playing'
  }

  const volumeRow = getDb()
    .prepare('SELECT volume FROM music_volume WHERE target_id = ?')
    .get(playback.targetId) as { volume: number } | undefined

  return {
    status,
    targetId: playback.targetId,
    targetName: target?.friendly_name ?? null,
    sourceId: playback.sourceId,
    title: media?.title ?? null,
    artist: media?.artist ?? null,
    artworkUrl: media?.artworkUrl ?? null,
    elapsedMs: media?.currentTimeMs ?? null,
    durationMs: media?.durationMs ?? null,
    volume: volumeRow?.volume ?? (session?.volume != null ? Math.round(session.volume * 100) : null),
    error: playback.error,
    updatedAt: playback.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export const castRuntime = {
  start() {
    const s = state()
    if (s.started) return
    s.started = true

    s.discovery = new CastDiscovery()
    s.discovery.start()

    s.sweepTimer = setInterval(() => {
      try { s.discovery?.sweep() } catch (err) { console.error('[cast] sweep failed:', err) }
    }, SWEEP_INTERVAL_MS)

    s.reconcileTimer = setInterval(() => {
      for (const targetId of s.sessions.keys()) {
        refresh(targetId).catch(() => { /* markTargetOffline already ran */ })
      }
    }, RECONCILE_INTERVAL_MS)

    console.log('[cast] runtime started')
  },

  stop() {
    const s = state()
    if (s.sweepTimer) clearInterval(s.sweepTimer)
    if (s.reconcileTimer) clearInterval(s.reconcileTimer)
    s.sweepTimer = null
    s.reconcileTimer = null

    for (const targetId of [...s.sessions.keys()]) closeSession(targetId)
    s.sessions.clear()
    s.playback = null

    try { s.discovery?.stop() } catch { /* already stopped */ }
    s.discovery = null
    s.started = false
  },

  sweepNow() {
    state().discovery?.sweep()
  },

  play,
  transport,
  seek,
  setVolume,
  release,
  getState,
}
