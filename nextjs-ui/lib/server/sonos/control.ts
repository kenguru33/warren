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
import type { MusicPlaybackState, SonosQueueEntryView, SonosQueueView } from '@/lib/shared/types'
import { deviceFor, SONOS_FAKE, SONOS_PORT } from './discovery'
import type { TargetRow } from '../targets'

export type SonosResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** Bounds on queue paging, so a pathological queue cannot spin the request. */
const QUEUE_PAGE_SIZE = 100
const MAX_QUEUE_PAGES = 20

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
interface FakeQueueEntry { title: string; artist: string | null }
interface FakeState {
  transport: FakeTransport
  favoriteId: string | null
  volume: number
  /** Mutated by the fake's queue operations, so ordering assertions are real. */
  queue: FakeQueueEntry[]
  currentIndex: number
  /**
   * A radio stream leaves a stale queue behind it. Modelling that separately
   * matters: the merged Sonos work shipped a broken play button for rounds
   * because the fake could not reach the state the real speaker was in.
   */
  streaming: boolean
}

declare global {
  var __warren_sonos_fake: FakeState | undefined
}

function fake(): FakeState {
  if (!globalThis.__warren_sonos_fake) {
    globalThis.__warren_sonos_fake = {
      transport: 'STOPPED',
      favoriteId: null,
      volume: 30,
      queue: [
        { title: 'First fake track', artist: 'Warren test' },
        { title: 'Second fake track', artist: 'Warren test' },
        { title: 'Third fake track', artist: 'Warren test' },
      ],
      currentIndex: 1,
      streaming: false,
    }
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

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/**
 * The speaker's queue.
 *
 * Unlike GetFavorites(), the library's queue parser does carry what playback
 * needs — TrackUri, Title and AlbumArtUri — so this uses it directly rather
 * than re-parsing raw DIDL. Verified against a real speaker holding a real
 * queue; favorites needed raw DIDL only because their parser drops <res>.
 */
export async function listQueue(target: TargetRow): Promise<SonosResult<SonosQueueView>> {
  if (SONOS_FAKE) {
    const f = fake()
    return {
      ok: true,
      value: {
        mode: f.streaming ? 'stream' : 'queue',
        entries: f.streaming ? [] : f.queue.map((entry, i) => ({
          index: i + 1,
          title: entry.title,
          artist: entry.artist,
          album: null,
          artworkUrl: null,
          isCurrent: i + 1 === f.currentIndex,
        })),
      },
    }
  }

  try {
    const d = device(target)

    // A radio stream has no meaningful queue; whatever is in Q:0 is left over
    // from an earlier session, so it must not be presented as "up next".
    const state = await d.GetState()
    const currentUri = String(state.mediaInfo?.CurrentURI ?? '')
    if (currentUri && !currentUri.startsWith('x-rincon-queue:')) {
      return { ok: true, value: { mode: 'stream', entries: [] } }
    }

    const currentTrack = Number(state.positionInfo?.Track ?? 0)

    const entries: SonosQueueEntryView[] = []
    // Queues can be long where a favorites list cannot, so this pages rather
    // than assuming one request covers it.
    let start = 0
    for (let guard = 0; guard < MAX_QUEUE_PAGES; guard++) {
      const page = await d.ContentDirectoryService.BrowseParsed({
        ObjectID: 'Q:0',
        BrowseFlag: 'BrowseDirectChildren',
        Filter: '*',
        StartingIndex: start,
        RequestedCount: QUEUE_PAGE_SIZE,
        SortCriteria: '',
      })
      const tracks = Array.isArray(page?.Result) ? page.Result : []
      if (!tracks.length) break

      for (const track of tracks) {
        const index = entries.length + 1
        entries.push({
          index,
          title: track.Title ?? 'Unknown track',
          artist: track.Artist ?? null,
          album: track.Album ?? null,
          artworkUrl: track.AlbumArtUri ?? null,
          isCurrent: index === currentTrack,
        })
      }

      start += tracks.length
      if (entries.length >= (page.TotalMatches ?? entries.length)) break
    }

    return { ok: true, value: { mode: 'queue', entries } }
  } catch (err) {
    return failure(err, 'Could not read the Sonos queue')
  }
}

/** Sonos addresses queue entries as Q:0/N, 1-based. */
function queueObjectId(index: number): string {
  return `Q:0/${index}`
}

export async function playQueueIndex(target: TargetRow, index: number): Promise<SonosResult<void>> {
  if (SONOS_FAKE) {
    const f = fake()
    if (index < 1 || index > f.queue.length) return { ok: false, error: 'No such queue entry' }
    f.currentIndex = index
    f.transport = 'PLAYING'
    return { ok: true, value: undefined }
  }

  try {
    const d = device(target)
    // Play *before* seeking. Verified against real hardware: Play() on a
    // stopped transport restarts the queue at track 1, so seeking first and
    // then playing silently lands on the wrong entry. Seeking while the
    // transport is already running moves to the requested track and stays.
    await d.Play().catch(() => { /* already playing, or nothing loaded yet */ })
    await d.AVTransportService.Seek({ InstanceID: 0, Unit: 'TRACK_NR', Target: String(index) })
    return { ok: true, value: undefined }
  } catch (err) {
    return failure(err, 'Could not play that queue entry')
  }
}

export async function removeQueueEntry(target: TargetRow, index: number): Promise<SonosResult<void>> {
  if (SONOS_FAKE) {
    const f = fake()
    if (index < 1 || index > f.queue.length) return { ok: false, error: 'No such queue entry' }
    f.queue.splice(index - 1, 1)
    if (f.currentIndex > f.queue.length) f.currentIndex = f.queue.length
    return { ok: true, value: undefined }
  }

  try {
    // UpdateID 0 is accepted by the speaker; verified against real hardware.
    await device(target).AVTransportService.RemoveTrackFromQueue({
      InstanceID: 0, ObjectID: queueObjectId(index), UpdateID: 0,
    })
    return { ok: true, value: undefined }
  } catch (err) {
    return failure(err, 'Could not remove that queue entry')
  }
}

/**
 * Move one entry. `toIndex` is the 1-based position it should end up at.
 *
 * Sonos takes an *insert-before* position rather than a destination, and the
 * two differ when moving downwards: removing the entry first shifts everything
 * after it up by one, so inserting before `toIndex` would land one short.
 */
export async function moveQueueEntry(
  target: TargetRow,
  index: number,
  toIndex: number,
): Promise<SonosResult<void>> {
  if (SONOS_FAKE) {
    const f = fake()
    if (index < 1 || index > f.queue.length) return { ok: false, error: 'No such queue entry' }
    if (toIndex < 1 || toIndex > f.queue.length) return { ok: false, error: 'No such queue position' }
    const [moved] = f.queue.splice(index - 1, 1)
    f.queue.splice(toIndex - 1, 0, moved)
    return { ok: true, value: undefined }
  }

  try {
    const insertBefore = toIndex > index ? toIndex + 1 : toIndex
    await device(target).AVTransportService.ReorderTracksInQueue({
      InstanceID: 0, StartingIndex: index, NumberOfTracks: 1, InsertBefore: insertBefore, UpdateID: 0,
    })
    return { ok: true, value: undefined }
  } catch (err) {
    return failure(err, 'Could not move that queue entry')
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
