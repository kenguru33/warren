// Browser-target playback: a single YouTube IFrame player shared across the tab.
//
// Music is one global player, so this module holds one player and one state —
// the per-room ownership handshake it used to arbitrate is gone with the rooms.
//
// Playback is never started without a user gesture: this module exposes no
// autoplay path; `play()` is only ever called from a click handler.
//
// Playback is private to this tab. Nothing here talks to the server, and no
// other client can observe it — which is exactly why the server reports the
// browser target as idle.

import type { MusicSourceView } from '@/lib/shared/types'

const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api'

/** Minimum embed viewport required by YouTube's terms. */
export const MIN_PLAYER_PX = 200

export interface BrowserPlayerState {
  active: boolean
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'unsupported'
  title: string | null
  artist: string | null
  elapsedMs: number | null
  durationMs: number | null
  volume: number
  error: string | null
}

type Listener = (state: BrowserPlayerState) => void

interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  nextVideo(): void
  previousVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setVolume(volume: number): void
  getCurrentTime(): number
  getDuration(): number
  getVideoData(): { title?: string; author?: string }
  destroy(): void
}

interface YTNamespace {
  Player: new (el: HTMLElement, options: Record<string, unknown>) => YTPlayer
  PlayerState: { ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5 }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

/**
 * Turn an IFrame API `onError` code into something the user can act on.
 *
 * 101/150 is the one to read carefully: it nominally means "the owner does not
 * allow embedded playback", but YouTube also returns it for perfectly
 * embeddable *music* when the embedding origin is a bare IP address. That is
 * why the dashboard has to be served from a hostname — see the deployment
 * constraint in _specs/youtube-music-component.md.
 *
 * Codes per developers.google.com/youtube/iframe_api_reference#onError.
 */
/**
 * True when the page is served from a bare IP literal rather than a name.
 * YouTube treats such an origin as unattributable and refuses to embed
 * licensed music from it, which is the single most likely cause of a 150 here.
 */
function isIpOrigin(): boolean {
  const host = window.location.hostname
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')
}

function describePlayerError(code: number, kind: MusicSourceView['kind']): string {
  const noun = kind === 'track' ? 'track' : kind
  switch (code) {
    case 2:
      return `That ${noun} link looks malformed — re-copy it from YouTube Music`
    case 5:
      return 'This browser could not play the source'
    case 100:
      return kind === 'track'
        ? 'That track is private or deleted'
        : `That ${noun} is private or deleted. Private playlists can't be embedded — set it to Unlisted in YouTube Music`
    case 101:
    case 150:
      return isIpOrigin()
        ? `YouTube blocks music embeds on IP addresses. Open the dashboard by hostname instead of ${window.location.hostname}`
        : `The owner does not allow this ${noun} to be played outside YouTube`
    default:
      return 'This source could not be played'
  }
}

/**
 * The embed URL for a source.
 *
 * A playlist or album uses YouTube's documented playlist form, `videoseries`
 * standing in for the video ID; a track addresses its video directly.
 * `enablejsapi` + `origin` are what let the IFrame API attach to an iframe it
 * did not create.
 */
function embedUrl(source: MusicSourceView): string {
  const path = source.kind === 'track' ? source.contentId : 'videoseries'
  const params = new URLSearchParams({
    enablejsapi: '1',
    origin: window.location.origin,
    autoplay: '1',          // safe: play() is only reached from a user gesture
    playsinline: '1',
    rel: '0',
  })
  if (source.kind !== 'track') params.set('list', source.contentId)
  return `https://www.youtube.com/embed/${path}?${params}`
}

let apiPromise: Promise<YTNamespace> | null = null

/**
 * Load the IFrame API once per tab. Rejects if the script cannot load — an old
 * wall-panel browser, or a network that blocks youtube.com — which surfaces as
 * the tile's `unsupported` state rather than a silently dead player.
 */
function loadIframeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('no window'))
      return
    }
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }

    const timer = setTimeout(() => reject(new Error('YouTube player did not load')), 15_000)

    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      clearTimeout(timer)
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube player did not load'))
    }

    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const script = document.createElement('script')
      script.src = IFRAME_API_SRC
      script.async = true
      script.onerror = () => { clearTimeout(timer); reject(new Error('YouTube player did not load')) }
      document.head.appendChild(script)
    }
  }).catch(err => {
    apiPromise = null
    throw err
  })

  return apiPromise
}

class BrowserPlayer {
  private player: YTPlayer | null = null
  private listeners = new Set<Listener>()
  private ticker: NodeJS.Timeout | null = null

  private state: BrowserPlayerState = {
    active: false, status: 'idle', title: null, artist: null,
    elapsedMs: null, durationMs: null, volume: 100, error: null,
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => { this.listeners.delete(listener) }
  }

  getState(): BrowserPlayerState {
    return this.state
  }

  private emit(patch: Partial<BrowserPlayerState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.state)
  }

  /**
   * Start `source`. Must be called from a user gesture.
   */
  async play(mount: HTMLElement, source: MusicSourceView): Promise<void> {
    this.emit({ active: true, status: 'loading', error: null, title: null, artist: null })

    let YT: YTNamespace
    try {
      YT = await loadIframeApi()
    } catch (err) {
      this.emit({
        status: 'unsupported',
        error: err instanceof Error ? err.message : 'YouTube player unavailable',
      })
      return
    }

    // Starting a new source tears the old instance down — the iframe is bound
    // to the mount node it was created in.
    this.teardownPlayer()

    const onReady = () => {
      this.startTicker()
      this.emit({ status: 'playing' })
    }

    const onStateChange = (event: { data: number }) => {
      if (event.data === YT.PlayerState.PLAYING) this.emit({ status: 'playing' })
      else if (event.data === YT.PlayerState.PAUSED) this.emit({ status: 'paused' })
      else if (event.data === YT.PlayerState.ENDED) this.emit({ status: 'idle' })
      this.readMetadata()
    }

    const onError = (event: { data: number }) => {
      this.emit({ status: 'error', error: describePlayerError(event.data, source.kind) })
    }

    // The iframe is built here rather than letting YT.Player create it because
    // `new YT.Player(el, …)` *replaces* `el` with the iframe it makes. Handing
    // it the tile's mount node left React's ref pointing at a detached element,
    // so the second play of a session rendered into nothing. Owning the iframe
    // keeps the mount stable across sources.
    //
    // Both addressing forms are equivalent to the API's own: `/embed/<videoId>`
    // for a track, `/embed/videoseries?list=…` for a playlist or album.
    const iframe = document.createElement('iframe')
    iframe.width = '100%'
    iframe.height = '100%'
    iframe.allow = 'autoplay; encrypted-media'
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    iframe.style.border = '0'
    iframe.src = embedUrl(source)

    mount.replaceChildren(iframe)

    this.player = new YT.Player(iframe, {
      events: { onReady, onStateChange, onError },
    })
  }

  private readMetadata() {
    if (!this.player) return
    try {
      const data = this.player.getVideoData()
      this.emit({ title: data.title ?? null, artist: data.author ?? null })
    } catch { /* player not ready yet */ }
  }

  private startTicker() {
    this.stopTicker()
    this.ticker = setInterval(() => {
      if (!this.player) return
      try {
        this.emit({
          elapsedMs: Math.round(this.player.getCurrentTime() * 1000),
          durationMs: Math.round(this.player.getDuration() * 1000),
        })
      } catch { /* transient during load */ }
    }, 1000)
  }

  private stopTicker() {
    if (this.ticker) clearInterval(this.ticker)
    this.ticker = null
  }

  private teardownPlayer() {
    this.stopTicker()
    if (this.player) {
      try { this.player.destroy() } catch { /* already gone */ }
      this.player = null
    }
  }

  pause()    { try { this.player?.pauseVideo() } catch {} }
  resume()   { try { this.player?.playVideo() } catch {} }
  next()     { try { this.player?.nextVideo() } catch {} }
  previous() { try { this.player?.previousVideo() } catch {} }

  seek(positionMs: number) {
    try { this.player?.seekTo(positionMs / 1000, true) } catch {}
  }

  setVolume(volume: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)))
    try { this.player?.setVolume(clamped) } catch {}
    this.emit({ volume: clamped })
  }

  /** Give up the player; the tile returns to idle. */
  release() {
    if (!this.state.active) return
    this.teardownPlayer()
    this.emit({
      active: false, status: 'idle', title: null, artist: null,
      elapsedMs: null, durationMs: null, error: null,
    })
  }

}

export const browserPlayer = new BrowserPlayer()
