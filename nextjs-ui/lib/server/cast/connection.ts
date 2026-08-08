// A single CASTV2 connection to one Cast device.
//
// Responsibilities: keep a TLS socket alive, launch the YouTube receiver, read
// pushed status updates, set device volume, and obtain the MDX screen ID that
// the lounge layer needs. Everything here is documented Cast behaviour; the
// undocumented part lives in lounge.ts.

import { EventEmitter } from 'node:events'
import tls from 'node:tls'
import { encodeFrame, FrameReader } from './protobuf'

export const NS_CONNECTION = 'urn:x-cast:com.google.cast.tp.connection'
export const NS_HEARTBEAT  = 'urn:x-cast:com.google.cast.tp.heartbeat'
export const NS_RECEIVER   = 'urn:x-cast:com.google.cast.receiver'
export const NS_MEDIA      = 'urn:x-cast:com.google.cast.media'
export const NS_MDX        = 'urn:x-cast:com.google.youtube.mdx'

/** The YouTube receiver application. The Default Media Receiver cannot play YouTube. */
export const YOUTUBE_APP_ID = '233637DE'

const SENDER_ID = 'sender-0'
const PLATFORM_RECEIVER_ID = 'receiver-0'

const HEARTBEAT_INTERVAL_MS = 5_000
const HEARTBEAT_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MS = 10_000
const CONNECT_TIMEOUT_MS = 8_000

export interface ReceiverApplication {
  appId: string
  sessionId: string
  transportId: string
  displayName?: string
  statusText?: string
}

export interface ReceiverStatus {
  applications: ReceiverApplication[]
  volumeLevel: number | null
  muted: boolean
}

interface PendingRequest {
  resolve: (payload: Record<string, unknown>) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

export interface MediaStatus {
  mediaSessionId: number
  playerState: 'IDLE' | 'BUFFERING' | 'PLAYING' | 'PAUSED'
  currentTimeMs: number | null
  durationMs: number | null
  title: string | null
  artist: string | null
  artworkUrl: string | null
}

export interface CastConnectionEvents {
  receiverStatus: [ReceiverStatus]
  mediaStatus: [MediaStatus | null]
  close: [Error | null]
}

/**
 * Emits `receiverStatus` / `mediaStatus` as the device pushes them — this is
 * why the runtime does not need to poll. Emits `close` exactly once.
 */
export class CastConnection extends EventEmitter {
  private socket: tls.TLSSocket | null = null
  private reader = new FrameReader()
  private requestId = 1
  private pending = new Map<number, PendingRequest>()
  private virtualConnections = new Set<string>()
  private heartbeatTimer: NodeJS.Timeout | null = null
  private lastPongAt = 0
  private closed = false

  constructor(
    readonly host: string,
    readonly port: number = 8009,
  ) {
    super()
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const settle = (err?: Error) => {
        clearTimeout(timer)
        if (err) reject(err)
        else resolve()
      }
      const timer = setTimeout(
        () => { this.destroy(new Error('connect timeout')); settle(new Error('connect timeout')) },
        CONNECT_TIMEOUT_MS,
      )

      // Cast devices present a self-signed certificate. There is no CA to
      // validate against; the connection is LAN-local by construction.
      const socket = tls.connect({
        host: this.host,
        port: this.port,
        rejectUnauthorized: false,
      }, () => {
        this.openVirtualConnection(PLATFORM_RECEIVER_ID)
        this.startHeartbeat()
        settle()
      })

      socket.on('data', chunk => this.onData(chunk as Buffer))
      socket.on('error', err => { this.destroy(err as Error); settle(err as Error) })
      socket.on('close', () => this.destroy(null))

      this.socket = socket
    })
  }

  private onData(chunk: Buffer) {
    for (const frame of this.reader.push(chunk)) {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(frame.payload) as Record<string, unknown>
      } catch {
        continue
      }

      const type = typeof payload.type === 'string' ? payload.type : ''

      if (frame.namespace === NS_HEARTBEAT) {
        if (type === 'PING') this.send(NS_HEARTBEAT, { type: 'PONG' }, frame.sourceId)
        if (type === 'PONG') this.lastPongAt = Date.now()
        continue
      }

      if (frame.namespace === NS_CONNECTION && type === 'CLOSE') {
        this.destroy(new Error('device closed the connection'))
        continue
      }

      const requestId = typeof payload.requestId === 'number' ? payload.requestId : null
      if (requestId !== null) {
        const waiting = this.pending.get(requestId)
        if (waiting) {
          clearTimeout(waiting.timer)
          this.pending.delete(requestId)
          waiting.resolve(payload)
        }
      }

      if (type === 'RECEIVER_STATUS') {
        this.emit('receiverStatus', parseReceiverStatus(payload))
      } else if (type === 'MEDIA_STATUS') {
        this.emit('mediaStatus', parseMediaStatus(payload))
      }
    }
  }

  private startHeartbeat() {
    this.lastPongAt = Date.now()
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        this.destroy(new Error('heartbeat timeout'))
        return
      }
      this.send(NS_HEARTBEAT, { type: 'PING' }, PLATFORM_RECEIVER_ID)
    }, HEARTBEAT_INTERVAL_MS)
  }

  /**
   * Every destination — the platform receiver and each launched app — needs its
   * own virtual connection opened before it will accept messages.
   */
  private openVirtualConnection(destinationId: string) {
    if (this.virtualConnections.has(destinationId)) return
    this.virtualConnections.add(destinationId)
    this.send(NS_CONNECTION, { type: 'CONNECT' }, destinationId)
  }

  private send(namespace: string, payload: Record<string, unknown>, destinationId: string) {
    if (!this.socket || this.closed) return
    this.socket.write(encodeFrame({
      sourceId: SENDER_ID,
      destinationId,
      namespace,
      payload: JSON.stringify(payload),
    }))
  }

  private request(
    namespace: string,
    payload: Record<string, unknown>,
    destinationId: string,
  ): Promise<Record<string, unknown>> {
    if (this.closed) return Promise.reject(new Error('connection closed'))
    const requestId = this.requestId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`${String(payload.type ?? namespace)} timed out`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(requestId, { resolve, reject, timer })
      this.send(namespace, { ...payload, requestId }, destinationId)
    })
  }

  async getStatus(): Promise<ReceiverStatus> {
    const reply = await this.request(NS_RECEIVER, { type: 'GET_STATUS' }, PLATFORM_RECEIVER_ID)
    return parseReceiverStatus(reply)
  }

  /** Launch the YouTube receiver, or return the running instance if already up. */
  async launchYouTube(): Promise<ReceiverApplication> {
    const current = await this.getStatus()
    const running = current.applications.find(a => a.appId === YOUTUBE_APP_ID)
    if (running) {
      this.openVirtualConnection(running.transportId)
      return running
    }

    const reply = await this.request(
      NS_RECEIVER,
      { type: 'LAUNCH', appId: YOUTUBE_APP_ID },
      PLATFORM_RECEIVER_ID,
    )
    const status = parseReceiverStatus(reply)
    const app = status.applications.find(a => a.appId === YOUTUBE_APP_ID)
    if (!app) throw new Error('YouTube receiver did not start')
    this.openVirtualConnection(app.transportId)
    return app
  }

  /**
   * The MDX screen ID is the handle the lounge API uses to address this device.
   * Only the YouTube receiver answers this, so it must be launched first.
   */
  async getScreenId(transportId: string): Promise<string> {
    this.openVirtualConnection(transportId)
    const reply = await this.request(NS_MDX, { type: 'getMdxSessionStatus' }, transportId)
    const data = reply.data as { screenId?: string } | undefined
    const screenId = data?.screenId
    if (!screenId) throw new Error('device did not report an MDX screen ID')
    return screenId
  }

  /**
   * Media-namespace status. The YouTube receiver answers this documented API,
   * so now-playing metadata does not depend on the lounge layer.
   */
  async getMediaStatus(transportId: string): Promise<MediaStatus | null> {
    this.openVirtualConnection(transportId)
    const reply = await this.request(NS_MEDIA, { type: 'GET_STATUS' }, transportId)
    return parseMediaStatus(reply)
  }

  /**
   * Transport control over the documented media namespace rather than the
   * lounge protocol — see the scope note in lounge.ts.
   */
  async mediaCommand(
    transportId: string,
    mediaSessionId: number,
    type: 'PLAY' | 'PAUSE' | 'STOP' | 'QUEUE_NEXT' | 'QUEUE_PREV',
  ): Promise<void> {
    this.openVirtualConnection(transportId)
    await this.request(NS_MEDIA, { type, mediaSessionId }, transportId)
  }

  async seek(transportId: string, mediaSessionId: number, seconds: number): Promise<void> {
    this.openVirtualConnection(transportId)
    await this.request(
      NS_MEDIA,
      { type: 'SEEK', mediaSessionId, currentTime: Math.max(0, seconds) },
      transportId,
    )
  }

  /** Device volume, 0..1. This is a device-level setting other apps also change. */
  async setVolume(level: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, level))
    await this.request(
      NS_RECEIVER,
      { type: 'SET_VOLUME', volume: { level: clamped } },
      PLATFORM_RECEIVER_ID,
    )
  }

  async stopApp(sessionId: string): Promise<void> {
    await this.request(NS_RECEIVER, { type: 'STOP', sessionId }, PLATFORM_RECEIVER_ID)
  }

  get isOpen(): boolean {
    return !this.closed && this.socket !== null
  }

  /**
   * Idempotent. Closing matters more here than for a timer: a Cast device holds
   * the socket open and will eventually refuse new senders if we leak them.
   */
  destroy(err: Error | null) {
    if (this.closed) return
    this.closed = true

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null

    for (const [, waiting] of this.pending) {
      clearTimeout(waiting.timer)
      waiting.reject(err ?? new Error('connection closed'))
    }
    this.pending.clear()
    this.virtualConnections.clear()
    this.reader.reset()

    if (this.socket) {
      this.socket.removeAllListeners()
      try { this.socket.destroy() } catch { /* already gone */ }
      this.socket = null
    }

    this.emit('close', err)
    this.removeAllListeners()
  }
}

function parseMediaStatus(payload: Record<string, unknown>): MediaStatus | null {
  const entries = payload.status as {
    mediaSessionId?: number
    playerState?: string
    currentTime?: number
    media?: {
      duration?: number
      metadata?: {
        title?: string
        artist?: string
        albumArtist?: string
        songName?: string
        images?: { url?: string }[]
      }
    }
  }[] | undefined

  const status = entries?.[0]
  if (!status || typeof status.mediaSessionId !== 'number') return null

  const meta = status.media?.metadata
  const playerState = status.playerState
  const known = playerState === 'IDLE' || playerState === 'BUFFERING'
    || playerState === 'PLAYING' || playerState === 'PAUSED'

  return {
    mediaSessionId: status.mediaSessionId,
    playerState: known ? playerState : 'IDLE',
    currentTimeMs: typeof status.currentTime === 'number' ? Math.round(status.currentTime * 1000) : null,
    durationMs: typeof status.media?.duration === 'number' ? Math.round(status.media.duration * 1000) : null,
    title: meta?.title ?? meta?.songName ?? null,
    artist: meta?.artist ?? meta?.albumArtist ?? null,
    artworkUrl: meta?.images?.[0]?.url ?? null,
  }
}

function parseReceiverStatus(payload: Record<string, unknown>): ReceiverStatus {
  const status = payload.status as {
    applications?: {
      appId?: string; sessionId?: string; transportId?: string
      displayName?: string; statusText?: string
    }[]
    volume?: { level?: number; muted?: boolean }
  } | undefined

  return {
    applications: (status?.applications ?? [])
      .filter(a => a.appId && a.sessionId && a.transportId)
      .map(a => ({
        appId: a.appId!,
        sessionId: a.sessionId!,
        transportId: a.transportId!,
        displayName: a.displayName,
        statusText: a.statusText,
      })),
    volumeLevel: typeof status?.volume?.level === 'number' ? status.volume.level : null,
    muted: status?.volume?.muted === true,
  }
}
