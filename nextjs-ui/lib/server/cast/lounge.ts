// The YouTube "lounge" protocol — the reverse-engineered layer.
//
// THIS FILE IS UNSUPPORTED AND EXPECTED TO BREAK. Google does not document
// this API and changes it without notice. It is isolated here, behind a
// Result-returning interface that never throws, so that when it does break the
// blast radius is one file: the tile degrades to its `unknown` / `error` state
// and the rest of the server is unaffected.
//
// SCOPE NOTE — this layer is deliberately as small as possible. The only thing
// that genuinely requires the lounge protocol is *starting* specific content on
// the device (`setPlaylist`). Once something is playing, the YouTube receiver
// answers the standard, documented Cast media namespace, so transport control
// (play/pause/next/previous/seek) and now-playing status go through
// connection.ts instead. Keeping those on documented APIs means a lounge
// breakage costs us "can't start new content", not "cast is dead".
//
// Reference implementations consulted: pyytlounge (Python), ytcast (Go),
// youtube_lounge_rs (Rust). There is no Node equivalent, which is why this exists.

const LOUNGE_BASE = 'https://www.youtube.com/api/lounge'
const TOKEN_BATCH_URL = `${LOUNGE_BASE}/pairing/get_lounge_token_batch`
const BIND_URL = `${LOUNGE_BASE}/bp/bind`

const REQUEST_TIMEOUT_MS = 10_000

export type LoungeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

function fail<T>(error: string): LoungeResult<T> {
  return { ok: false, error }
}

export interface LoungeSessionInfo {
  screenId: string
  loungeToken: string
  sid: string
  gsessionid: string
}

/** Deterministic-length random ids. Not security-sensitive; the API just wants uniqueness. */
function randomId(length = 16): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

async function postForm(
  url: string,
  body: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<LoungeResult<string>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        // The lounge API rejects requests without a browser-ish UA.
        'user-agent': 'Mozilla/5.0 (compatible; Warren/1.0)',
        ...headers,
      },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    })
    if (!res.ok) return fail(`lounge HTTP ${res.status}`)
    return { ok: true, value: await res.text() }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return fail('lounge request timed out')
    return fail(err instanceof Error ? err.message : 'lounge request failed')
  } finally {
    clearTimeout(timer)
  }
}

/** Exchange an MDX screen ID (from CastConnection.getScreenId) for a lounge token. */
export async function getLoungeToken(screenId: string): Promise<LoungeResult<string>> {
  const res = await postForm(TOKEN_BATCH_URL, { screen_ids: screenId })
  if (!res.ok) return res

  try {
    const parsed = JSON.parse(res.value) as {
      screens?: { screenId?: string; loungeToken?: string }[]
    }
    const token = parsed.screens?.find(s => s.screenId === screenId)?.loungeToken
      ?? parsed.screens?.[0]?.loungeToken
    if (!token) return fail('lounge token missing from response')
    return { ok: true, value: token }
  } catch {
    return fail('lounge token response was not JSON')
  }
}

/**
 * The bind response is a chunked stream of `<byteLength>\n<json>` records. The
 * JSON is an array of `[eventIndex, [eventName, ...args]]`. We need two of
 * them: `c` carries the SID, `S` carries the gsessionid.
 */
function parseBindResponse(body: string): { sid: string | null; gsessionid: string | null } {
  let sid: string | null = null
  let gsessionid: string | null = null

  // Rather than track byte offsets, pull out every top-level JSON array and
  // walk it — the framing lengths are not needed to interpret the content.
  for (const match of body.matchAll(/\[\[\d+,\[.*?\]\]\]/gs)) {
    try {
      const events = JSON.parse(match[0]) as [number, unknown[]][]
      for (const [, event] of events) {
        if (!Array.isArray(event) || typeof event[0] !== 'string') continue
        if (event[0] === 'c' && typeof event[1] === 'string') sid = event[1]
        if (event[0] === 'S' && typeof event[1] === 'string') gsessionid = event[1]
      }
    } catch {
      // Partial or unexpected record — keep scanning the rest.
    }
  }

  return { sid, gsessionid }
}

function bindParams(loungeToken: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    device: 'REMOTE_CONTROL',
    id: randomId(32),
    name: 'Warren',
    app: 'youtube-desktop',
    'mdx-version': '3',
    loungeIdToken: loungeToken,
    VER: '8',
    v: '2',
    CVER: '1',
    t: '1',
    zx: randomId(12),
    ...extra,
  })
}

/**
 * Establish a lounge session for a screen. Returns the session handles needed
 * to issue commands.
 */
export async function openLoungeSession(screenId: string): Promise<LoungeResult<LoungeSessionInfo>> {
  const tokenRes = await getLoungeToken(screenId)
  if (!tokenRes.ok) return tokenRes

  const loungeToken = tokenRes.value
  const params = bindParams(loungeToken, { RID: String(Math.floor(Math.random() * 90_000) + 10_000) })

  const bindRes = await postForm(`${BIND_URL}?${params.toString()}`, { count: '0' })
  if (!bindRes.ok) return bindRes

  const { sid, gsessionid } = parseBindResponse(bindRes.value)
  if (!sid || !gsessionid) return fail('lounge bind did not return a session')

  return { ok: true, value: { screenId, loungeToken, sid, gsessionid } }
}

export interface SetPlaylistOptions {
  /** Playlist or album id. Omit for a single track. */
  listId?: string
  /** Video id. Required for a track; optional starting point within a list. */
  videoId?: string
}

/**
 * Start content on the device. This is the one operation that genuinely needs
 * the lounge protocol — everything else uses the documented media namespace.
 *
 * Note the anonymity constraint: no credentials are sent, so the receiver plays
 * signed-out. Private and library-only content will not resolve, and ads may
 * play. Callers mark sources that fail this way as `browser_only`.
 */
export async function setPlaylist(
  session: LoungeSessionInfo,
  options: SetPlaylistOptions,
): Promise<LoungeResult<void>> {
  if (!options.listId && !options.videoId) return fail('nothing to play')

  const params = bindParams(session.loungeToken, {
    SID: session.sid,
    gsessionid: session.gsessionid,
    RID: String(Math.floor(Math.random() * 90_000) + 10_000),
    AID: '5',
  })

  const body: Record<string, string> = {
    count: '1',
    ofs: '0',
    req0__sc: 'setPlaylist',
    req0_currentTime: '0',
    req0_audioOnly: 'false',
    req0_currentIndex: options.listId ? '0' : '-1',
  }
  if (options.listId) body.req0_listId = options.listId
  if (options.videoId) body.req0_videoId = options.videoId

  const res = await postForm(`${BIND_URL}?${params.toString()}`, body)
  if (!res.ok) return res
  return { ok: true, value: undefined }
}

/**
 * Full start-to-playing flow for one device. The caller supplies the screen ID
 * it got over CASTV2; this handles session setup and content start.
 */
export async function startContent(
  screenId: string,
  options: SetPlaylistOptions,
): Promise<LoungeResult<LoungeSessionInfo>> {
  const session = await openLoungeSession(screenId)
  if (!session.ok) return session

  const played = await setPlaylist(session.value, options)
  if (!played.ok) return fail(played.error)

  return session
}
