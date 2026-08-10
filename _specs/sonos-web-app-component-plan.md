# Implementation Plan: Sonos Web App Component

Spec: [`sonos-web-app-component.md`](sonos-web-app-component.md)

The spec's measurements already removed the two large options — embedding `play.sonos.com` and building a catalogue browser — leaving a queue view plus a link out. This plan is therefore small, and it is deliberately front-loaded with a verification step, because the spec's first open question can still shrink it further.

## 1. Spec reality check vs. existing code

What already exists and is reused unchanged:

- `lib/server/sonos/control.ts` — the UPnP call layer, with the typed-failure discipline (`SonosResult<T>`), the `decodeXml` helper and the DIDL parsing already written for favorites. Queue reads parse the same doubly-escaped DIDL, so `parseFavorites` and `decodeXml` are the pattern to follow, not to duplicate.
- `lib/server/sonos/discovery.ts` — `deviceFor(targetId, address, port)` resolves a target to a `SonosDevice`. No discovery change.
- `lib/server/sonos/runtime.ts` — `requireTarget()` + `isReachable()` guards. Queue functions get the same treatment.
- `lib/server/targets.ts` — target lookup. Untouched.
- `app/api/music/targets/[targetId]/favorites/route.ts` — the exact shape the queue endpoint copies: resolve target, reject non-Sonos with 400, map runtime failure to 502.
- `app/components/warren/music-tile.tsx` — `TileMenu` already hosts per-tile actions; the queue dialog opens from there.

What the spec needs that does not exist:

- Queue read and mutation in `control.ts`.
- A queue endpoint pair.
- A dialog component.
- Fake queue states.

One correction to an assumption worth making explicit: `SonosDevice.GetQueue()` exists in `@svrooij/sonos`, but the favorites work established that the library's parsed browse results **drop `<res>` and `<r:resMD>`**. Queue rows need at least the track URI to be actionable, so this must be checked against the raw DIDL path before `GetQueue()` is trusted — see step 2.

## 2. Step 0: verification spike — DONE, gate cleared

Run against the reference speaker with a queue populated from three silent
16-bit/44.1kHz WAVs served over HTTP from the host. Outcome:

| Check | Result |
|---|---|
| `Browse('Q:0')` raw DIDL | entries as `Q:0/N`, **1-based**; `UpdateID` readable |
| `GetQueue()` parsed | **sufficient** — carries `Title`, `Artist`, `TrackUri`, `AlbumArtUri`, unlike `GetFavorites()`. No raw DIDL needed. |
| play-at-index | works — `Seek({ Unit: 'TRACK_NR' })`, from both `PLAYING` and `STOPPED` |
| remove | works — `RemoveTrackFromQueue({ ObjectID: 'Q:0/N', UpdateID: 0 })` |
| reorder | works — `ReorderTracksInQueue({ StartingIndex, NumberOfTracks: 1, InsertBefore, UpdateID: 0 })` |

**All three mutations survived, so nothing is dropped from the feature.**

Three findings that changed the implementation:

1. **Play before Seek, not after.** `Play()` on a stopped transport restarts the
   queue at track 1, so seek-then-play silently lands on the wrong entry.
2. **The device lags about a second** before reporting a track change, so the
   re-read returned by a `play` mutation can still show the previous entry as
   current. The client renders that response and then revalidates.
3. **8-bit PCM WAV is not playable by Sonos.** It enqueues fine and then refuses
   to start, leaving the transport `STOPPED` with no error — which looked
   exactly like a broken implementation for several rounds. 16-bit/44.1kHz works.
   Worth recording: an unplayable fixture is indistinguishable from a bug.

### Original spike definition (for reference)

The spec's first open question is that the reference household's queue was empty when measured, so only the *read* shape is confirmed. Everything downstream depends on which mutations the speaker actually accepts.

Sequence, against `192.168.80.33` with a real queue present (play an album from the Sonos app first):

1. `Browse('Q:0')` raw — confirm the DIDL carries per-entry title, artist, album art and `<res>`.
2. Compare with `GetQueue()` — establish whether the library's parser is sufficient or whether raw DIDL is required, as it was for favorites.
3. `AVTransportService.Seek({ InstanceID: 0, Unit: 'TRACK_NR', Target: '<n>' })` — play-at-index.
4. `AVTransportService.RemoveTrackFromQueue({ InstanceID: 0, ObjectID: 'Q:0/<n>', UpdateID: 0 })` — remove.
5. `AVTransportService.ReorderTracksInQueue({ InstanceID: 0, StartingIndex, NumberOfTracks: 1, InsertBefore, UpdateID: 0 })` — reorder.

**Gate:** any of 3–5 that the speaker rejects is dropped from the feature rather than shipped as a control that fails. Record the outcome in the spec's Known Limitations, as the 402-on-favorite finding was. If *all* mutations fail, the feature reduces to a read-only queue view, which is still worth shipping and should be said plainly rather than abandoned.

This spike is throwaway script work, not committed code.

## 3. New and edited files

### 3.1 `lib/server/sonos/control.ts` (edit)

Add alongside the favorites functions, reusing `decodeXml` and the existing `device()` helper:

- `listQueue(target)` → `SonosResult<SonosQueueEntry[]>`. Browses `Q:0` with paging (`RequestedCount` 100, loop on `TotalMatches`) because a queue can be long where a favorites list cannot. Each entry carries queue position, title, artist, album, artwork URL and the track URI.
- `playQueueIndex(target, index)`, `removeQueueEntry(target, index)`, `moveQueueEntry(target, from, to)` — only those the spike confirmed.

Every function returns a typed failure. The `402` mapping added for favorites is favorite-specific and must not be copied blindly; queue faults get their own mapping only where a raw UPnP code would otherwise reach the user.

### 3.2 `lib/server/sonos/runtime.ts` (edit)

Thin wrappers mirroring `favorites()`: `requireTarget` → `isReachable` → delegate. Export through the `sonosRuntime` object so route handlers stay thin.

Also: a mutation invalidates any in-flight read, so wrappers re-read after a successful mutation and return the fresh list rather than letting the client guess.

### 3.3 `app/api/music/targets/[targetId]/queue/route.ts` (new)

- `GET` — the queue. Copies the favorites route exactly: 404 unknown target, 400 non-Sonos, 502 on runtime failure.
- `POST` — one of `{ action: 'play' | 'remove' | 'move', index, toIndex? }`. Returns the re-read queue so the client never holds an optimistic list.

A single POST with an action discriminator rather than three endpoints: they share resolution, guards and the re-read, and three routes would triplicate all of it.

### 3.4 `lib/shared/types.ts` (edit)

`SonosQueueEntryView` — `index`, `title`, `artist`, `album`, `artworkUrl`, `isCurrent`. Shared, because the dialog and the route both need it.

`isCurrent` is computed server-side from the speaker's current track position, so the client does not re-derive it from playback state that may be a poll behind.

### 3.5 `lib/hooks/use-music.ts` (edit)

`useSonosQueue(targetId)` beside `useSonosFavorites` — same conditional-key SWR pattern, null key when the target is not Sonos. Returns the list, an error string, and an `act(action, index, toIndex?)` that POSTs and revalidates from the response.

### 3.6 `app/components/warren/sonos-queue-modal.tsx` (new)

Catalyst `Dialog` + `DialogTitle`/`DialogBody`/`DialogActions`, matching `light-group-detail-modal.tsx`.

- Scrollable list using `.pretty-scroll`; current entry marked.
- Per row: tap the row to play; a move-up, move-down and remove control as explicit buttons. **No drag-and-drop** — the wall panel is tap-only and a drag competes with scrolling.
- Controls are always visible, not hover-revealed. If any auto-hide is wanted, `pointer-fine:` per the styling rules — plain `group-hover` is wrong on touch.
- Three distinct empty states, which the spec calls out as separate: empty queue ("choose something in the Sonos app"), radio stream playing (no meaningful queue), and read failure.
- `DialogActions` holds the link to `https://play.sonos.com`, labelled as where to choose new music — `target="_blank" rel="noreferrer"`, a link and never a frame.

### 3.7 `app/components/warren/music-tile.tsx` (edit)

Add a `Queue…` entry to `menuItems`, present only when `isSonos`. Opening state is local to the tile; the modal is rendered from the tile, as the group-detail modal is rendered from the room card.

The tile itself does not otherwise change.

## 4. Fake states

`WARREN_SONOS_FAKE` currently models transport (`PLAYING` / `PAUSED_PLAYBACK` / `STOPPED`) and a favorites list. It must gain a queue with three reachable states:

- populated (several entries, one current),
- empty,
- radio stream playing with a stale queue behind it.

This is not optional polish. The merged Sonos work shipped a broken play button through several rounds because the fake could not represent "stopped but loaded" — the one state the real speaker was in. A fake that cannot reach a state means the tests cannot either.

Mutations against the fake mutate the fake array, so ordering assertions are meaningful rather than trivially true.

## 5. Test plan (Playwright E2E)

Extend `tests/e2e/music.spec.ts` in the existing `sonos` describe block — a new spec file would duplicate the login and reset scaffolding.

API-level, all runnable without hardware:

- queue lists for a Sonos target, with `isCurrent` set on exactly one entry;
- queue is refused for a Cast target with 400, as favorites are;
- `play` at an index reports playing;
- `remove` shortens the list and the response is the re-read list;
- `move` changes order, asserted on titles rather than indices;
- an unknown action is a 400;
- an out-of-range index is a 400, not a 502 — bad input from our own client is a client error;
- empty-queue and radio-stream states return distinguishable payloads.

UI-level, written but honestly unverifiable here: **the Playwright browser download has failed repeatedly in this environment, so the 14 existing UI tests do not run.** New UI tests should be written and their unrun status stated rather than counted as passing.

## 6. Sequencing

1. Spike (§2) against real hardware with a real queue. **Gate the rest on the result.**
2. `types.ts` + `control.ts` read path; verify against the speaker.
3. Route `GET`; verify with `curl` through Caddy.
4. Fake queue states; API tests for the read path.
5. Mutations — only those the spike confirmed — in `control.ts`, runtime, route `POST`; tests.
6. Hook + modal + tile menu entry.
7. `tsc`, `eslint` on changed files, `next build`, full E2E.
8. Rebuild the `ui` container and verify against the real speaker.
9. Docs: `nextjs-ui/CLAUDE.md` Sonos section; spec Known Limitations for whatever the spike ruled out.

## 7. Risks and edge cases

- **Mutations may not work.** The primary risk, hence the gate. Read-only is an acceptable outcome.
- **`GetQueue()` may drop the fields needed**, exactly as `GetFavorites()` did. Raw DIDL is the fallback and the spike settles it.
- **`UpdateID`** — Sonos uses it for optimistic concurrency on queue writes. Passing `0` usually works but may be rejected; if so, read the current `UpdateID` from the browse response and pass it through.
- **A long queue** needs paging. Favorites never did, so this is new: loop on `TotalMatches`, and cap at a sane bound rather than fetching thousands of rows into a dialog.
- **Grouped speakers** — the queue belongs to the coordinator. Targets are already coordinators only, so this should follow for free, but it is worth one explicit check with a grouped pair.
- **Concurrent mutation from the Sonos app** invalidates indices. Every mutation returns the re-read list, and the dialog renders from that response.
- **The stale-favorite `402`** is unrelated and remains unfixed.

## 8. Explicitly not changing

- Discovery, group-coordinator addressing, transport, volume, now-playing, resume-on-play.
- The favorites picker, which remains how content is started from Warren.
- The Cast and browser playback paths.
- `music_targets`, `music_sources`, `music_config` — no schema change, so **no `SNAPSHOT_SCHEMA_VERSION` bump**.
- No new dependency.

## 9. Verification

- `npx tsc --noEmit` clean.
- `npx eslint` clean on changed files (two pre-existing errors in `room-card.tsx` and a `handleSaveRef` warning in `page.tsx` are not mine and stay).
- `npm run build` clean.
- Full E2E: the current baseline is **56 passing, 2 failing on the missing Playwright browser, 1 skipped**. New API tests must add to the passing count without changing the failing one.
- Against the real speaker: read a populated queue, and exercise each mutation that survived the gate.

## Critical files

- `nextjs-ui/lib/server/sonos/control.ts` — queue read + mutations; reuse `decodeXml`, do not re-derive DIDL parsing
- `nextjs-ui/lib/server/sonos/runtime.ts` — guards and re-read-after-mutate
- `nextjs-ui/app/api/music/targets/[targetId]/queue/route.ts` — mirror the favorites route's error mapping
- `nextjs-ui/app/components/warren/sonos-queue-modal.tsx` — tap-only, three empty states, link not frame
- `nextjs-ui/app/components/warren/music-tile.tsx` — menu entry, Sonos-only
- `nextjs-ui/tests/e2e/music.spec.ts` — extend the `sonos` block
