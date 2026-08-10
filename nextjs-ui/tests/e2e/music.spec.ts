import { test, expect, login, loginViaApi } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

// Runs with WARREN_CAST_FAKE=1 and WARREN_SONOS_FAKE=1 (playwright.config.ts),
// which seed fake Cast and Sonos targets and stub the CASTV2 and UPnP layers.
// That is what makes either path testable at all — the real ones need hardware
// on the LAN.
//
// Music is global state, not per-room, so these tests reset it rather than
// isolating themselves behind a throwaway room. The suite runs with
// `fullyParallel: false` and one worker, so sharing that state is safe.

const PLAYLIST_URL = 'https://music.youtube.com/playlist?list=PLtest123456789'
const ALBUM_URL = 'https://music.youtube.com/playlist?list=OLAK5uy_abcdefghijk'
const TRACK_URL = 'https://music.youtube.com/watch?v=dQw4w9WgXcQ'

interface MusicView {
  configured: boolean
  sources: { id: number; name: string; kind: string; contentId: string; isDefault: boolean }[]
  preferredTargetId: string | null
  playback: { status: string; targetId: string | null }
}

async function resetMusic(request: APIRequestContext) {
  await request.delete('/api/music')
}

async function enableMusic(request: APIRequestContext, preferredTargetId: string | null = null) {
  const res = await request.put('/api/music', { data: { preferredTargetId } })
  expect(res.ok()).toBeTruthy()
  return await res.json() as MusicView
}

async function addSource(request: APIRequestContext, url: string, name: string) {
  const res = await request.post('/api/music/sources', { data: { url, name } })
  expect(res.status()).toBe(201)
  return await res.json() as { id: number; kind: string; contentId: string }
}

interface TargetView {
  targetId: string
  friendlyName: string
  origin: string
  protocol: 'cast' | 'sonos'
  groupRooms: string[]
  reachable: boolean
}

async function targets(request: APIRequestContext): Promise<TargetView[]> {
  return await (await request.get('/api/music/targets')).json() as TargetView[]
}

async function discoveredTarget(request: APIRequestContext): Promise<string> {
  const target = (await targets(request)).find(t => t.origin === 'discovered' && t.protocol === 'cast')
  expect(target).toBeTruthy()
  return target!.targetId
}

async function sonosTarget(request: APIRequestContext, grouped = false): Promise<TargetView> {
  const found = (await targets(request))
    .find(t => t.protocol === 'sonos' && (grouped ? t.groupRooms.length > 0 : t.groupRooms.length === 0))
  expect(found).toBeTruthy()
  return found!
}

test.describe('music (API)', () => {
  test.beforeEach(async ({ request }) => {
    await loginViaApi(request)
    await resetMusic(request)
  })

  test('music is unconfigured until it is enabled', async ({ request }) => {
    const before = await (await request.get('/api/music')).json() as MusicView
    expect(before.configured).toBe(false)
    expect(before.sources).toEqual([])

    await enableMusic(request)
    const after = await (await request.get('/api/music')).json() as MusicView
    expect(after.configured).toBe(true)
  })

  test('rooms carry no music payload any more', async ({ request }) => {
    await enableMusic(request)
    const rooms = await (await request.get('/api/rooms')).json() as Record<string, unknown>[]
    // The player is global; a room object must not imply otherwise.
    for (const room of rooms) expect(room).not.toHaveProperty('music')
  })

  test('a source can be saved and read back', async ({ request }) => {
    await enableMusic(request)
    const created = await addSource(request, PLAYLIST_URL, 'Dinner')
    expect(created.kind).toBe('playlist')
    expect(created.contentId).toBe('PLtest123456789')

    const view = await (await request.get('/api/music')).json() as MusicView
    expect(view.sources).toHaveLength(1)
    expect(view.sources[0].name).toBe('Dinner')
    // The first source added becomes the default.
    expect(view.sources[0].isDefault).toBe(true)
  })

  test('albums and tracks are recognised by their identifier shape', async ({ request }) => {
    await enableMusic(request)
    const album = await addSource(request, ALBUM_URL, 'An album')
    expect(album.kind).toBe('album')
    const track = await addSource(request, TRACK_URL, 'A track')
    expect(track.kind).toBe('track')
    expect(track.contentId).toBe('dQw4w9WgXcQ')
  })

  test('an unrecognised URL is rejected at the point of entry', async ({ request }) => {
    await enableMusic(request)
    const res = await request.post('/api/music/sources', {
      data: { url: 'https://example.com/not-youtube', name: 'Nope' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json() as { message: string }
    expect(body.message).toMatch(/youtube music/i)
  })

  test('the library is capped', async ({ request }) => {
    await enableMusic(request)
    for (let i = 0; i < 12; i++) {
      const res = await request.post('/api/music/sources', {
        data: { url: `https://music.youtube.com/playlist?list=PLcap${i}00000000`, name: `S${i}` },
      })
      expect(res.status()).toBe(201)
    }
    const overflow = await request.post('/api/music/sources', {
      data: { url: PLAYLIST_URL, name: 'One too many' },
    })
    expect(overflow.status()).toBe(400)
  })

  test('exactly one source is the default', async ({ request }) => {
    await enableMusic(request)
    const first = await addSource(request, PLAYLIST_URL, 'First')
    await addSource(request, ALBUM_URL, 'Second')

    const patched = await request.patch(`/api/music/sources/${first.id}`, {
      data: { isDefault: true },
    })
    expect(patched.ok()).toBeTruthy()
    const sources = await patched.json() as MusicView['sources']
    expect(sources.filter(s => s.isDefault)).toHaveLength(1)
    expect(sources.find(s => s.isDefault)?.id).toBe(first.id)
  })

  test('removing music drops the library', async ({ request }) => {
    await enableMusic(request)
    await addSource(request, PLAYLIST_URL, 'Doomed')

    await resetMusic(request)
    const gone = await (await request.get('/api/music')).json() as MusicView
    expect(gone.configured).toBe(false)

    // Re-enabling starts empty rather than resurrecting the old library.
    await enableMusic(request)
    const view = await (await request.get('/api/music')).json() as MusicView
    expect(view.sources).toEqual([])
  })
})

test.describe('music targets', () => {
  test.beforeEach(async ({ request }) => {
    await loginViaApi(request)
  })

  test('fake discovery seeds cast targets', async ({ request }) => {
    const cast = (await targets(request)).filter(t => t.protocol === 'cast')
    expect(cast.length).toBeGreaterThanOrEqual(2)
    expect(cast.every(t => t.reachable)).toBe(true)
  })

  test('a target can be added manually and removed', async ({ request }) => {
    // Manual targets outlive the test that made them, so a run interrupted
    // between create and delete would otherwise poison every later run.
    const existing = await targets(request)
    for (const t of existing.filter(t => t.origin === 'manual')) {
      await request.delete(`/api/music/targets/${t.targetId}`)
    }

    const created = await request.post('/api/music/targets', {
      data: { address: '192.168.77.42', friendlyName: 'Manual speaker' },
    })
    expect(created.status()).toBe(201)
    const target = await created.json() as { targetId: string; origin: string }
    expect(target.origin).toBe('manual')

    // Manual entries survive a discovery sweep that doesn't see them.
    await request.post('/api/music/targets/discover')
    const afterSweep = await targets(request)
    expect(afterSweep.some(t => t.targetId === target.targetId)).toBe(true)

    expect((await request.delete(`/api/music/targets/${target.targetId}`)).ok()).toBeTruthy()
  })

  test('a bad IP is rejected', async ({ request }) => {
    const res = await request.post('/api/music/targets', { data: { address: 'kitchen.local' } })
    expect(res.status()).toBe(400)
  })

  test('discovered targets cannot be deleted', async ({ request }) => {
    const discovered = (await targets(request)).find(t => t.origin === 'discovered')
    expect(discovered).toBeTruthy()
    const res = await request.delete(`/api/music/targets/${discovered!.targetId}`)
    expect(res.status()).toBe(400)
  })
})

test.describe('music playback', () => {
  test.beforeEach(async ({ request }) => {
    await loginViaApi(request)
    await resetMusic(request)
  })

  test('playing on a cast target reports playing state', async ({ request }) => {
    const targetId = await discoveredTarget(request)
    await enableMusic(request, targetId)
    const source = await addSource(request, PLAYLIST_URL, 'Cast me')

    const played = await request.post('/api/music/command', {
      data: { command: 'play', sourceId: source.id },
    })
    expect(played.ok()).toBeTruthy()

    const state = await (await request.get('/api/music/state')).json() as
      { status: string; targetId: string }
    expect(state.status).toBe('playing')
    expect(state.targetId).toBe(targetId)

    const paused = await request.post('/api/music/command', { data: { command: 'pause' } })
    expect(paused.ok()).toBeTruthy()
    const afterPause = await (await request.get('/api/music/state')).json() as { status: string }
    expect(afterPause.status).toBe('paused')
  })

  test('switching output moves the player rather than starting a second stream', async ({ request }) => {
    const cast = (await targets(request)).filter(t => t.protocol === 'cast')
    const [first, second] = cast
    expect(second).toBeTruthy()

    await enableMusic(request, first.targetId)
    const source = await addSource(request, PLAYLIST_URL, 'Movable')
    await request.post('/api/music/command', { data: { command: 'play', sourceId: source.id } })

    const before = await (await request.get('/api/music/state')).json() as { targetId: string }
    expect(before.targetId).toBe(first.targetId)

    // Re-pointing the single player releases whatever the old target held.
    await enableMusic(request, second.targetId)
    await request.post('/api/music/command', { data: { command: 'play', sourceId: source.id } })

    const after = await (await request.get('/api/music/state')).json() as
      { status: string; targetId: string }
    expect(after.targetId).toBe(second.targetId)
    expect(after.status).toBe('playing')
  })

  test('an unknown target is rejected, and no target means the browser', async ({ request }) => {
    await enableMusic(request)
    const state = await (await request.get('/api/music/state')).json() as { status: string }
    // No target chosen → browser target → idle is the correct server view.
    expect(state.status).toBe('idle')

    const bogus = await request.put('/api/music', { data: { preferredTargetId: 'does-not-exist' } })
    expect(bogus.status()).toBe(400)
  })

  // The target-offline path can't be reached under WARREN_CAST_FAKE: the fake
  // marks discovered targets fresh on every sweep and manual targets are
  // reachable by definition. Verifying it needs a real speaker that is then
  // powered off — see the manual verification notes in the spec.
  test.skip('a remembered target that goes offline reports target-offline', () => {})

  test('the browser target returns intent rather than server-side playback', async ({ request }) => {
    await enableMusic(request, 'browser')
    const source = await addSource(request, TRACK_URL, 'Local')

    const res = await request.post('/api/music/command', {
      data: { command: 'play', sourceId: source.id },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json() as { target: string; source: { contentId: string } }
    expect(body.target).toBe('browser')
    expect(body.source.contentId).toBe(source.contentId)

    // The server must not claim anything is playing — that audio is private to
    // whichever tab started it.
    const state = await (await request.get('/api/music/state')).json() as { status: string }
    expect(state.status).toBe('idle')
  })
})

test.describe('sonos', () => {
  test.beforeEach(async ({ request }) => {
    await loginViaApi(request)
    await resetMusic(request)
  })

  test('sonos speakers are discovered and listed alongside cast targets', async ({ request }) => {
    const all = await targets(request)
    const sonos = all.filter(t => t.protocol === 'sonos')
    const cast = all.filter(t => t.protocol === 'cast')

    // One combined list, each kind distinguishable.
    expect(sonos.length).toBeGreaterThanOrEqual(2)
    expect(cast.length).toBeGreaterThanOrEqual(2)
    expect(sonos.every(t => t.reachable)).toBe(true)
    // Labelled by the Sonos room name, not an IP or a model.
    expect(sonos.map(t => t.friendlyName)).toContain('Kitchen')
  })

  test('a grouped speaker is one entry naming the rooms it carries', async ({ request }) => {
    const grouped = await sonosTarget(request, true)
    expect(grouped.friendlyName).toBe('Living Room')
    expect(grouped.groupRooms).toContain('Dining Room')

    // Members bound into a group are not offered as independent outputs.
    const all = await targets(request)
    expect(all.some(t => t.friendlyName === 'Dining Room')).toBe(false)
  })

  test('sonos target ids cannot collide with cast ones', async ({ request }) => {
    const all = await targets(request)
    expect(all.filter(t => t.protocol === 'sonos').every(t => t.targetId.startsWith('sonos:'))).toBe(true)
    expect(new Set(all.map(t => t.targetId)).size).toBe(all.length)
  })

  test('favorites are listed for a sonos target and refused for a cast one', async ({ request }) => {
    const sonos = await sonosTarget(request)
    const favorites = await (await request.get(
      `/api/music/targets/${encodeURIComponent(sonos.targetId)}/favorites`,
    )).json() as { id: string; title: string }[]
    expect(favorites.length).toBeGreaterThan(0)
    expect(favorites[0].title).toBeTruthy()

    // Favorites are a Sonos concept; a Cast target has Warren's own library.
    const castId = await discoveredTarget(request)
    const refused = await request.get(`/api/music/targets/${encodeURIComponent(castId)}/favorites`)
    expect(refused.status()).toBe(400)
  })

  test('playing a favorite reports playing state', async ({ request }) => {
    const sonos = await sonosTarget(request)
    await enableMusic(request, sonos.targetId)

    const favorites = await (await request.get(
      `/api/music/targets/${encodeURIComponent(sonos.targetId)}/favorites`,
    )).json() as { id: string }[]

    const played = await request.post('/api/music/command', {
      data: { command: 'play', favoriteId: favorites[0].id },
    })
    expect(played.ok()).toBeTruthy()

    const state = await (await request.get('/api/music/state')).json() as
      { status: string; targetId: string }
    expect(state.status).toBe('playing')
    expect(state.targetId).toBe(sonos.targetId)

    const paused = await request.post('/api/music/command', { data: { command: 'pause' } })
    expect(paused.ok()).toBeTruthy()
    const after = await (await request.get('/api/music/state')).json() as { status: string }
    expect(after.status).toBe('paused')
  })

  test('a sonos target refuses a youtube source', async ({ request }) => {
    const sonos = await sonosTarget(request)
    await enableMusic(request, sonos.targetId)
    const source = await addSource(request, PLAYLIST_URL, 'Not on sonos')

    // Warren's YouTube library cannot play on Sonos, so a sourceId is not a
    // valid thing to ask for — better a clear 400 than a silent failure.
    const res = await request.post('/api/music/command', {
      data: { command: 'play', sourceId: source.id },
    })
    expect(res.status()).toBe(400)
    const body = await res.json() as { message: string }
    expect(body.message).toMatch(/favorite/i)
  })

  test('play without a favorite resumes rather than loading one', async ({ request }) => {
    const sonos = await sonosTarget(request)
    await enableMusic(request, sonos.targetId)

    // A stopped Sonos speaker is not an empty one: it usually still holds its
    // queue, or a station started from the Sonos app. Play must continue that
    // rather than replace it with a favorite the user did not ask for.
    const res = await request.post('/api/music/command', { data: { command: 'play' } })
    expect(res.ok()).toBeTruthy()

    const state = await (await request.get('/api/music/state')).json() as { status: string }
    expect(state.status).toBe('playing')
  })

  test('seek is not offered on a sonos target', async ({ request }) => {
    const sonos = await sonosTarget(request)
    await enableMusic(request, sonos.targetId)
    const res = await request.post('/api/music/command', {
      data: { command: 'seek', positionMs: 1000 },
    })
    expect(res.status()).toBe(400)
  })

  test('volume works on a sonos target', async ({ request }) => {
    const sonos = await sonosTarget(request)
    await enableMusic(request, sonos.targetId)
    const res = await request.post('/api/music/command', {
      data: { command: 'volume', volume: 42 },
    })
    expect(res.ok()).toBeTruthy()
    const state = await (await request.get('/api/music/state')).json() as { volume: number }
    expect(state.volume).toBe(42)
  })

  test('a sonos speaker can be added manually and is probed first', async ({ request }) => {
    for (const t of (await targets(request)).filter(t => t.origin === 'manual')) {
      await request.delete(`/api/music/targets/${t.targetId}`)
    }

    const created = await request.post('/api/music/targets', {
      data: { address: '192.168.77.99', protocol: 'sonos' },
    })
    expect(created.status()).toBe(201)
    const target = await created.json() as TargetView
    expect(target.protocol).toBe('sonos')
    expect(target.origin).toBe('manual')

    // Manual rows are never pruned by a sweep, unlike discovered ones.
    await request.post('/api/music/targets/discover')
    expect((await targets(request)).some(t => t.targetId === target.targetId)).toBe(true)

    expect((await request.delete(`/api/music/targets/${target.targetId}`)).ok()).toBeTruthy()
  })

  test('the queue lists entries with exactly one marked current', async ({ request }) => {
    const sonos = await sonosTarget(request)
    const queue = await (await request.get(
      `/api/music/targets/${encodeURIComponent(sonos.targetId)}/queue`,
    )).json() as { mode: string; entries: { index: number; title: string; isCurrent: boolean }[] }

    expect(queue.mode).toBe('queue')
    expect(queue.entries.length).toBeGreaterThan(1)
    expect(queue.entries.filter(e => e.isCurrent)).toHaveLength(1)
    // Indices are 1-based, matching the speaker's own Q:0/N addressing.
    expect(queue.entries[0].index).toBe(1)
  })

  test('a queue is refused for a cast target', async ({ request }) => {
    const castId = await discoveredTarget(request)
    const res = await request.get(`/api/music/targets/${encodeURIComponent(castId)}/queue`)
    expect(res.status()).toBe(400)
  })

  test('playing a queue entry makes it current', async ({ request }) => {
    const sonos = await sonosTarget(request)
    const url = `/api/music/targets/${encodeURIComponent(sonos.targetId)}/queue`

    const res = await request.post(url, { data: { action: 'play', index: 3 } })
    expect(res.ok()).toBeTruthy()
    // The mutation returns the re-read queue, so the client never guesses.
    const after = await res.json() as { entries: { index: number; isCurrent: boolean }[] }
    expect(after.entries.find(e => e.isCurrent)?.index).toBe(3)
  })

  test('removing an entry shortens the queue', async ({ request }) => {
    const sonos = await sonosTarget(request)
    const url = `/api/music/targets/${encodeURIComponent(sonos.targetId)}/queue`
    const before = await (await request.get(url)).json() as { entries: { title: string }[] }

    const res = await request.post(url, { data: { action: 'remove', index: 1 } })
    expect(res.ok()).toBeTruthy()
    const after = await res.json() as { entries: { title: string }[] }
    expect(after.entries).toHaveLength(before.entries.length - 1)
    expect(after.entries.map(e => e.title)).not.toContain(before.entries[0].title)
  })

  test('moving an entry reorders the queue', async ({ request }) => {
    const sonos = await sonosTarget(request)
    const url = `/api/music/targets/${encodeURIComponent(sonos.targetId)}/queue`
    const before = await (await request.get(url)).json() as { entries: { title: string }[] }
    const first = before.entries[0].title

    const res = await request.post(url, { data: { action: 'move', index: 1, toIndex: 2 } })
    expect(res.ok()).toBeTruthy()
    // Asserted on titles rather than indices, which shift by definition.
    const after = await res.json() as { entries: { title: string }[] }
    expect(after.entries[1].title).toBe(first)
  })

  test('bad queue input is a client error, not a speaker failure', async ({ request }) => {
    const sonos = await sonosTarget(request)
    const url = `/api/music/targets/${encodeURIComponent(sonos.targetId)}/queue`

    for (const data of [
      { action: 'explode', index: 1 },
      { action: 'play' },
      { action: 'play', index: 0 },
      { action: 'move', index: 1 },
    ]) {
      const res = await request.post(url, { data })
      expect(res.status()).toBe(400)
    }
  })

  test('switching from sonos back to the browser leaves the player idle', async ({ request }) => {
    const sonos = await sonosTarget(request)
    await enableMusic(request, sonos.targetId)

    await enableMusic(request, 'browser')
    const state = await (await request.get('/api/music/state')).json() as { status: string }
    // Browser playback is private to a tab; the server must not claim otherwise.
    expect(state.status).toBe('idle')
  })
})

test.describe('music (UI)', () => {
  test.beforeEach(async ({ request }) => {
    await loginViaApi(request)
    await resetMusic(request)
  })

  test('the player renders on the dashboard, outside any room card', async ({ page, request }) => {
    await enableMusic(request)
    await addSource(request, PLAYLIST_URL, 'Dashboard source')

    await login(page)
    await page.goto('/')

    await expect(page.getByTestId('music-title')).toBeVisible()
    // The player is global, so it must not live inside a room's <article>.
    const insideRoomCard = page.locator('article').getByTestId('music-player-mount')
    await expect(insideRoomCard).toHaveCount(0)
  })

  test('the embedded player region meets the 200x200 minimum', async ({ page, request }) => {
    await enableMusic(request)
    await addSource(request, PLAYLIST_URL, 'Sized')

    await login(page)
    await page.goto('/')

    await expect(page.getByTestId('music-title')).toBeVisible()

    // YouTube's terms require a >=200x200 viewport for the embed. The tile
    // reserves that space whether or not the player is mounted.
    const mountBox = await page.getByTestId('music-player-mount')
      .locator('xpath=..').boundingBox()
    expect(mountBox).not.toBeNull()
    expect(mountBox!.width).toBeGreaterThanOrEqual(200)
    expect(mountBox!.height).toBeGreaterThanOrEqual(200)
  })
})
