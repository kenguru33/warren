// Sonos control over local UPnP.
//
// **This is undocumented and unsupported by Sonos.** There has never been a
// local Control API — the official one is cloud-only and OAuth-bound — so every
// serious local integration (Home Assistant via SoCo, node-sonos-http-api) uses
// the UPnP/SOAP interface on port 1400. Warren accepts that dependency for the
// same reason it accepts ../cast/lounge.ts: the alternative is holding the
// user's Sonos cloud credentials server-side, which is a materially worse
// posture for a LAN dashboard.
//
// It therefore carries the same discipline as lounge.ts: every function returns
// a typed failure instead of throwing, so a protocol change degrades the Sonos
// target rather than taking the music player down with it.

import type { SonosDevice } from '@svrooij/sonos'
import type { MusicPlaybackState } from '@/lib/shared/types'
import { deviceFor, SONOS_FAKE, SONOS_PORT } from './discovery'
import type { TargetRow } from '../targets'

export type SonosResult<T> = { ok: true; value: T } | { ok: false; error: string }

export interface SonosFavorite {
  id: string
  title: string
  /** The `<res>` URI. Empty for shortcut favorites, which cannot be played. */
  uri: string
  /**
   * The favorite's own `<r:resMD>` DIDL. Sonos rejects SetAVTransportURI with
   * UPnPError 402 (Invalid args) when a stream arrives without it, and the
   * library's convenience wrappers only *guess* metadata — a guess that fails
   * for exactly the URI schemes favorites use. This must be passed through
   * verbatim.
   */
  metadata: string
  /** Containers (playlists, albums, stations) enqueue; items play directly. */
  isContainer: boolean
  artworkUrl: string | null
}

export interface SonosNowPlaying {
  status: MusicPlaybackState['status']
  title: string | null
  artist: string | null
  artworkUrl: string | null
  elapsedMs: number | null
  durationMs: number | null
  volume: number | null
}

function failure(err: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : fallback }
}

function device(target: TargetRow): SonosDevice {
  return deviceFor(target.target_id, target.address, target.port || SONOS_PORT)
}

// ---------------------------------------------------------------------------
// Fakes — WARREN_SONOS_FAKE, mirroring WARREN_CAST_FAKE
// ---------------------------------------------------------------------------

const FAKE_FAVORITES: SonosFavorite[] = [
  {
    id: 'FV:2/1', title: 'Chill playlist', uri: 'x-rincon-cpcontainer:fake-chill',
    metadata: '<DIDL-Lite/>', isContainer: true, artworkUrl: null,
  },
  {
    id: 'FV:2/2', title: 'Morning radio', uri: 'x-sonosapi-stream:fake-radio',
    metadata: '<DIDL-Lite/>', isContainer: false, artworkUrl: null,
  },
]

// Mirrors the three transport states a real speaker reports, rather than a
// boolean: pausing must read back as `paused`, not `idle`. Conflating them
// would let the tile claim nothing is playing when something is merely paused.
type FakeTransport = 'PLAYING' | 'PAUSED_PLAYBACK' | 'STOPPED'
interface FakeState { transport: FakeTransport; favoriteId: string | null; volume: number }

declare global {
  var __warren_sonos_fake: FakeState | undefined
}

function fake(): FakeState {
  if (!globalThis.__warren_sonos_fake) {
    globalThis.__warren_sonos_fake = { transport: 'STOPPED', favoriteId: null, volume: 30 }
  }
  return globalThis.__warren_sonos_fake
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The household's favorites. Read live rather than stored: the Sonos app owns
 * this list and can change it at any time, and a cached copy would offer
 * content that no longer exists.
 */
export async function listFavorites(target: TargetRow): Promise<SonosResult<SonosFavorite[]>> {
  if (SONOS_FAKE) return { ok: true, value: FAKE_FAVORITES }

  try {
    // Browse the raw DIDL rather than the library's GetFavorites(). Its parser
    // returns only Title/ItemId and drops both <res> and <r:resMD> — without
    // which a favorite cannot be played at all.
    const response = await device(target).ContentDirectoryService.Browse({
      ObjectID: 'FV:2',
      BrowseFlag: 'BrowseDirectChildren',
      Filter: '*',
      StartingIndex: 0,
      RequestedCount: 100,
      SortCriteria: '',
    })

    const xml = typeof response?.Result === 'string' ? decodeXml(response.Result) : ''
    return { ok: true, value: parseFavorites(xml) }
  } catch (err) {
    return failure(err, 'Could not read Sonos favorites')
  }
}

/** DIDL arrives escaped, and favorites nest a second escaped DIDL inside. */
function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Must be last: an ampersand entity can encode the others.
    .replace(/&amp;/g, '&')
}

function parseFavorites(xml: string): SonosFavorite[] {
  const favorites: SonosFavorite[] = []

  for (const match of xml.matchAll(/<item id="([^"]+)"[^>]*>([\s\S]*?)<\/item>/g)) {
    const [, id, body] = match
    const pick = (re: RegExp) => (body.match(re)?.[1] ?? '').trim()

    const uri = decodeXml(pick(/<res[^>]*>([\s\S]*?)<\/res>/))
    // Shortcut favorites (Sonos Radio entries and the like) carry an empty
    // <res>. There is no URI to play, so offering them would guarantee a
    // failure — they are left out rather than shown and broken.
    if (!uri) continue

    const metadata = decodeXml(pick(/<r:resMD>([\s\S]*?)<\/r:resMD>/))
    favorites.push({
      id,
      title: pick(/<dc:title>([\s\S]*?)<\/dc:title>/) || 'Untitled',
      uri,
      metadata,
      isContainer: /<upnp:class>object\.container/.test(metadata),
      artworkUrl: decodeXml(pick(/<upnp:albumArtURI>([\s\S]*?)<\/upnp:albumArtURI>/)) || null,
    })
  }

  return favorites
}

/**
 * What the speaker is doing right now — including audio Warren did not start.
 * Read from the device rather than assumed from the last command sent, so a
 * user pressing play in the Sonos app is reflected here.
 */
export async function readState(target: TargetRow): Promise<SonosResult<SonosNowPlaying>> {
  if (SONOS_FAKE) {
    const f = fake()
    const active = f.transport !== 'STOPPED'
    return {
      ok: true,
      value: {
        status: f.transport === 'PLAYING' ? 'playing'
          : f.transport === 'PAUSED_PLAYBACK' ? 'paused'
          : 'idle',
        title: active ? 'Fake Sonos track' : null,
        artist: active ? 'Warren test' : null,
        artworkUrl: null,
        elapsedMs: active ? 0 : null,
        durationMs: active ? 180_000 : null,
        volume: f.volume,
      },
    }
  }

  try {
    const d = device(target)
    const state = await d.GetState()
    const transport = state.transportState

    // Both fields are `string | Track`; a string is DIDL the library could not
    // parse, which is not something to guess at.
    const track = typeof state.positionInfo?.TrackMetaData === 'object'
      ? state.positionInfo.TrackMetaData
      : null
    const media = typeof state.mediaInfo?.CurrentURIMetaData === 'object'
      ? state.mediaInfo.CurrentURIMetaData
      : null

    return {
      ok: true,
      value: {
        status:
          transport === 'PLAYING' || transport === 'TRANSITIONING' ? 'playing'
          : transport === 'PAUSED_PLAYBACK' ? 'paused'
          : 'idle',
        title: displayTitle(track?.Title, media?.Title),
        artist: track?.Artist ?? null,
        // Radio carries its artwork on the media rather than the track.
        artworkUrl: track?.AlbumArtUri ?? media?.AlbumArtUri ?? null,
        elapsedMs: timeToMs(state.positionInfo?.RelTime),
        durationMs: timeToMs(state.positionInfo?.TrackDuration),
        volume: typeof state.volume === 'number' ? state.volume : null,
      },
    }
  } catch (err) {
    return failure(err, 'Could not read Sonos state')
  }
}

/**
 * On a radio stream Sonos puts the raw stream URL in the *track* title and the
 * station name in the *media* title, so taking the track title blindly renders
 * something like `P04_AH?userid=…&args=…` as the now-playing line. Prefer the
 * track title only when it reads like a name rather than a URL.
 */
function displayTitle(trackTitle?: string, mediaTitle?: string): string | null {
  const looksLikeUrl = (value?: string) =>
    !!value && !value.includes(' ') && /[?&=]|^https?:|^x-/.test(value)

  if (trackTitle && !looksLikeUrl(trackTitle)) return trackTitle
  if (mediaTitle && !looksLikeUrl(mediaTitle)) return mediaTitle
  return null
}

/** Sonos reports positions as H:MM:SS. */
function timeToMs(value: string | undefined): number | null {
  if (!value) return null
  const parts = value.split(':').map(Number)
  if (parts.some(Number.isNaN)) return null
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0] ?? 0, parts[1] ?? 0]
  return ((h * 60 + m) * 60 + s) * 1000
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Start a favorite. This is the only way Warren can put content on a Sonos
 * speaker: YouTube Music is a Sonos music service resolved against the user's
 * linked account, so a LAN controller cannot hand the speaker a YouTube id the
 * way the Cast receiver accepts one. Favorites are the supported escape hatch,
 * and are what Home Assistant exposes for the same reason.
 */
export async function playFavorite(
  target: TargetRow,
  favorite: SonosFavorite,
): Promise<SonosResult<void>> {
  if (SONOS_FAKE) {
    const f = fake()
    f.transport = 'PLAYING'
    f.favoriteId = favorite.id
    return { ok: true, value: undefined }
  }

  try {
    const d = device(target)
    const av = d.AVTransportService

    // The device's own methods guess metadata; favorites must supply their own,
    // so these go through AVTransportService directly.
    if (favorite.isContainer) {
      // A playlist, album or station list is enqueued and played from the
      // queue — SetAVTransportURI on a container does nothing useful.
      await av.RemoveAllTracksFromQueue({ InstanceID: 0 })
      await av.AddURIToQueue({
        InstanceID: 0,
        EnqueuedURI: favorite.uri,
        EnqueuedURIMetaData: favorite.metadata,
        DesiredFirstTrackNumberEnqueued: 0,
        EnqueueAsNext: false,
      })
      await d.SwitchToQueue()
    } else {
      await av.SetAVTransportURI({
        InstanceID: 0,
        CurrentURI: favorite.uri,
        CurrentURIMetaData: favorite.metadata,
      })
    }

    await d.Play()
    return { ok: true, value: undefined }
  } catch (err) {
    // 402 here means the speaker rejected the favorite's own URI and metadata,
    // which happens when a favorite outlives the music-service binding it was
    // saved under. Neither the URI nor the metadata is ours to correct — the
    // fix is to re-create the favorite — so say that instead of the UPnP fault.
    const message = err instanceof Error ? err.message : ''
    if (message.includes('402')) {
      return { ok: false, error: 'Sonos rejected this favorite — re-create it in the Sonos app' }
    }
    return failure(err, 'Could not start that favorite')
  }
}

export type SonosTransport = 'play' | 'pause' | 'next' | 'previous' | 'stop'

export async function transport(
  target: TargetRow,
  command: SonosTransport,
): Promise<SonosResult<void>> {
  if (SONOS_FAKE) {
    const f = fake()
    if (command === 'play') f.transport = 'PLAYING'
    if (command === 'pause') f.transport = 'PAUSED_PLAYBACK'
    if (command === 'stop') { f.transport = 'STOPPED'; f.favoriteId = null }
    return { ok: true, value: undefined }
  }

  try {
    const d = device(target)
    switch (command) {
      case 'play': await d.Play(); break
      case 'pause': await d.Pause(); break
      case 'next': await d.Next(); break
      case 'previous': await d.Previous(); break
      case 'stop': await d.Stop(); break
    }
    return { ok: true, value: undefined }
  } catch (err) {
    return failure(err, 'Sonos command failed')
  }
}

export async function setVolume(target: TargetRow, volume: number): Promise<SonosResult<void>> {
  const clamped = Math.max(0, Math.min(100, Math.round(volume)))

  if (SONOS_FAKE) {
    fake().volume = clamped
    return { ok: true, value: undefined }
  }

  try {
    await device(target).SetVolume(clamped)
    return { ok: true, value: undefined }
  } catch (err) {
    return failure(err, 'Sonos volume change failed')
  }
}

/**
 * Confirm a Sonos speaker actually answers at an address, used by the manual
 * add path. A target that will never work must be rejected rather than stored.
 */
export async function probe(address: string): Promise<SonosResult<{ uuid: string; name: string }>> {
  if (SONOS_FAKE) {
    return { ok: true, value: { uuid: `RINCON_MANUAL${address.replace(/\D/g, '')}`, name: 'Manual Sonos' } }
  }

  try {
    const d = deviceFor('', address, SONOS_PORT)
    await d.LoadDeviceData()
    const uuid = d.Uuid
    if (!uuid) return { ok: false, error: 'No Sonos speaker answered at that address' }
    return { ok: true, value: { uuid, name: d.Name ?? 'Sonos speaker' } }
  } catch {
    return { ok: false, error: 'No Sonos speaker answered at that address' }
  }
}
