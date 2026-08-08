// YouTube Music URL parsing.
//
// YouTube Music content is addressed by ordinary YouTube identifiers, which is
// what makes the officially supported IFrame Player API able to play it: a
// playlist URL carries a `list=` playlist ID, an album carries an `OLAK5uy_…`
// playlist ID, and a track is a `watch?v=` video ID. No unofficial endpoint is
// involved in resolving any of these.
//
// Shared because both the client (paste-time validation in the config modal)
// and the server (POST /api/rooms/[id]/music/sources) need it.

import type { MusicSourceKind } from './types'

export interface ParsedYouTubeRef {
  kind: MusicSourceKind
  contentId: string
}

/** Video IDs are exactly 11 URL-safe base64 characters. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

/**
 * Playlist IDs are longer and carry a type prefix: PL (user playlist), OLAK5uy_
 * (auto-generated album), RD (radio/mix), UU/LL/FL (channel-derived).
 */
const PLAYLIST_ID_RE = /^(PL|OLAK5uy_|RD|UU|LL|FL|SP)[A-Za-z0-9_-]+$/

const ALBUM_PREFIX = 'OLAK5uy_'

const HOSTS = new Set([
  'music.youtube.com',
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
])

/**
 * YouTube Music's own library links prefix playlist IDs with `VL` (e.g.
 * `VLPLabc…`). That prefix is a browse-endpoint artifact, not part of the
 * playlist ID — the embed rejects it, so strip it before storing.
 */
function stripVlPrefix(id: string): string {
  return id.startsWith('VL') ? id.slice(2) : id
}

function playlistKind(id: string): MusicSourceKind {
  return id.startsWith(ALBUM_PREFIX) ? 'album' : 'playlist'
}

function fromPlaylistId(raw: string): ParsedYouTubeRef | null {
  const id = stripVlPrefix(raw.trim())
  if (!PLAYLIST_ID_RE.test(id)) return null
  return { kind: playlistKind(id), contentId: id }
}

function fromVideoId(raw: string): ParsedYouTubeRef | null {
  const id = raw.trim()
  if (!VIDEO_ID_RE.test(id)) return null
  return { kind: 'track', contentId: id }
}

/**
 * Parse a pasted YouTube / YouTube Music URL — or a bare ID — into the kind of
 * content it refers to and the identifier the IFrame player needs.
 *
 * Returns null for anything unrecognized; callers surface that to the user
 * rather than storing a reference that will fail at play time.
 *
 * When a watch URL carries both `v` and `list`, the playlist wins: a music tile
 * wants continuous playback, and that is what the sharer's link represents
 * (a track *within* an album or radio station).
 */
export function parseYouTubeMusicUrl(input: string): ParsedYouTubeRef | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Bare IDs — checked before URL parsing so they don't need a scheme.
  if (!trimmed.includes('/') && !trimmed.includes('.')) {
    return fromPlaylistId(trimmed) ?? fromVideoId(trimmed)
  }

  let url: URL
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  if (!HOSTS.has(url.hostname.toLowerCase())) return null

  const list = url.searchParams.get('list')
  if (list) {
    const parsed = fromPlaylistId(list)
    if (parsed) return parsed
  }

  const v = url.searchParams.get('v')
  if (v) {
    const parsed = fromVideoId(v)
    if (parsed) return parsed
  }

  // youtu.be/<videoId> and /embed/<videoId> and /v/<videoId>
  const segments = url.pathname.split('/').filter(Boolean)
  if (url.hostname.toLowerCase().endsWith('youtu.be') && segments.length === 1) {
    return fromVideoId(segments[0])
  }
  if (segments.length === 2 && (segments[0] === 'embed' || segments[0] === 'v')) {
    return fromVideoId(segments[1])
  }
  // /playlist with the id in the path rather than the query (rare, but seen)
  if (segments.length === 2 && segments[0] === 'playlist') {
    return fromPlaylistId(segments[1])
  }

  return null
}

/** Human-readable guidance shown when a paste is rejected. */
export const YOUTUBE_URL_HELP =
  'Paste a YouTube Music playlist, album, or song link — for example ' +
  'https://music.youtube.com/playlist?list=… or https://music.youtube.com/watch?v=…'

/** Deep link back out to YouTube Music, used by the unsupported-browser state. */
export function youtubeMusicUrl(ref: ParsedYouTubeRef): string {
  return ref.kind === 'track'
    ? `https://music.youtube.com/watch?v=${ref.contentId}`
    : `https://music.youtube.com/playlist?list=${ref.contentId}`
}
