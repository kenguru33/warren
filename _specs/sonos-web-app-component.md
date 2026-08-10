# Feature Spec: Sonos Web App Component

## Overview

Sonos ships a browser-based controller at `play.sonos.com`. It signs in with a Sonos account and gives the household the full controller experience: browse the linked music services, search, build and reorder the queue, and group rooms. Warren's merged Sonos support does none of that — it discovers speakers, starts a saved favorite, and offers transport and volume.

The original framing of this feature was a choice between embedding that web app in Warren or rebuilding its browse surface on the local UPnP stack. Measuring both options settled it, and neither is what should be built.

**Embedding is not viable.** `play.sonos.com/nb-no/web-app` answers `307` to `/api/auth/signin`, so the working case requires a cross-origin frame to hold a third-party authenticated session — from a private hostname under a local CA, which is the least favourable case for current browser cookie policy.

**Rebuilding the browse surface has nothing to browse.** The speaker's own content directory was enumerated on the reference household: the music-services container is not locally browsable at all, the local music library is empty, and there are no saved queues. Everything the local surface exposes for content is the favorites list Warren already shows.

What is left is smaller and genuinely useful: **the queue**. When the user starts an album or playlist from a Sonos client, the speaker holds a queue that Warren can read, reorder and jump within — and "see and change what comes next without leaving the dashboard" was the real want behind asking for the web app. Content *selection* stays where it works, in Sonos's own clients, reached by a plain link.

## Goals

- Show what is queued on the selected Sonos speaker, and what is playing within it.
- Let the user jump to a track in the queue, reorder it, and remove entries.
- Give a clear way out to Sonos's own controller for choosing new content, since that is where content selection actually works.
- Leave the merged Sonos behaviour — discovery, favorites, transport, volume, now-playing, resume-on-play — exactly as it is.
- Work on the wall panel, which is tap-only.

## Non-Goals

- **Embedding `play.sonos.com`.** It is authentication-gated and would depend on third-party cookies in a cross-origin frame served from a private hostname. Measured and rejected, not deferred.
- **A catalogue browser over the linked music services.** The local content directory does not expose them; this is a measured limitation of the surface, not a scoping decision.
- Search, of any kind. There is nothing locally searchable, and the wall panel has no keyboard.
- Adding to the queue from Warren's own library. Warren's YouTube sources cannot play on Sonos, and its favorites already start playback directly.
- Grouping and ungrouping speakers. Warren observes grouping and respects it; changing it remains a separate question.
- Any Sonos account credential, in Warren or in a frame it controls.
- Changing the YouTube Music, Cast or browser playback paths.

## User Stories

- As a user, I want to see what is queued on the living-room speaker, so that I know what is coming without opening another app.
- As a user, I want to skip ahead to a specific track in the queue, so that I do not have to press next repeatedly.
- As a user, I want to remove a track I do not want, so that the queue reflects what the room should actually play.
- As a user, I want to reorder the queue, so that I can move something up without rebuilding it.
- As a user who wants to play something new, I want an obvious way to reach Sonos's own controller, so that I am not hunting for a capability Warren does not have.
- As a user on a wall panel, I want to do all of this by tapping, because that device has no keyboard.

## Functional Requirements

### Reading the queue

- The queue for the selected Sonos target is readable, showing each entry's title, artist and album art where the speaker provides them.
- The currently playing entry is identified within the list.
- An empty queue is stated as such, with the explanation that content is chosen in the Sonos app — not left as a blank panel.
- A speaker playing a radio stream has no meaningful queue; that state is distinguished from an empty one rather than shown as the same thing.
- The queue is read live. It belongs to the speaker and can change from any Sonos client at any time, so a cached copy would show entries that no longer exist.

### Acting on the queue

- Tapping an entry plays it, becoming the current track.
- An entry can be removed.
- An entry can be moved within the queue.
- Every one of these must be verified against a real speaker holding a real queue before it is offered. The merged Sonos work established that this surface does not always do what its documentation implies, and an action that fails silently on a queue is worse than one that is absent.
- Any operation the speaker rejects is reported plainly and the list re-read, rather than the UI assuming the change took effect.

### Reaching Sonos for content selection

- A clearly labelled link opens Sonos's own controller in a new tab or the native app.
- It is presented as the way to choose new content, not as an error path or a fallback.
- It is a link, not a frame.

### Interaction with existing Sonos support

- The favorites picker remains the way to start content from Warren. The queue view is additive.
- Nothing in this feature may regress discovery, group-coordinator addressing, transport, volume, now-playing state, or resume-rather-than-reload on play.
- The known limitation that some favorites are rejected by the speaker is unaffected and not addressed here.

## UI / UX

The queue opens from the music tile as a dialog, following the pattern the light-group and music-config dialogs already use — Catalyst components, semantic colour tokens, and the `pointer-fine:` treatment so controls stay visible on touch.

Entries are a scrollable list with the current track marked. Actions are tap targets on each row rather than hover-revealed, because the wall panel has no pointer. Reordering must work without a keyboard and without a drag gesture that competes with scrolling — move-up and move-down controls are the safer choice on a touch display than drag-and-drop.

The link out to Sonos sits at the foot of the dialog, labelled as where to choose new music, so its role is obvious rather than looking like a diagnostic.

The music tile itself does not change. It remains the glanceable now-playing surface with transport, volume and the output picker.

## Data Model

Nothing is persisted. The queue lives on the speaker and is read on demand, for the same reason favorites are: it is owned by the Sonos household and mutable from any client.

No new credential, and no new configuration.

## API

The existing Sonos endpoints gain queue reads and queue mutations, keyed by the target already identified in the path and following the shape of the favorites endpoint that exists. No new room-scoped endpoints — music is a global component and its endpoints live under the music path.

## Acceptance Criteria

- [ ] The queue for the selected Sonos target is listed with title, artist and artwork where available, and the current entry is identified.
- [ ] An empty queue and a radio stream are distinguished from each other and from a failure.
- [ ] Tapping an entry plays it; removing an entry removes it; moving an entry reorders it — each verified against a real speaker holding a real queue.
- [ ] A rejected operation is reported and the list re-read, with no optimistic UI left showing a change that did not happen.
- [ ] A clear, labelled link reaches Sonos's own controller for content selection.
- [ ] Nothing is embedded in a frame.
- [ ] Every action works by tap alone, with no keyboard and no drag gesture.
- [ ] The existing music E2E suite passes untouched, and discovery, transport, volume, now-playing and resume-on-play behave exactly as today.
- [ ] The fake models a populated queue, an empty queue and a radio stream, so the states are exercisable without hardware.

## Resolved Decisions

1. **Do not embed `play.sonos.com`.** It answers `307 → /api/auth/signin`, so any embed depends on a cross-origin frame holding a third-party authenticated session. Warren is served from a private hostname under a local CA — the least favourable case for third-party cookie policy, which browsers are actively restricting. Whether Sonos also sets `X-Frame-Options` could not be confirmed without an account, and it does not matter: the authentication dependency alone makes this unreliable, and a frame that works on one browser is worse than a link that works everywhere. This is the same mistake the merged Sonos work already paid for once, building on a capability that looked available and was not.

2. **Do not build a catalogue browser.** The reference household's speaker was enumerated directly, and the local content directory offers nothing to browse:

   | Container | Result |
   |---|---|
   | `S:` — music services | **0 items**; `S:0` returns `701 No such object` |
   | `A:ALBUM`, `A:TRACKS` — local library | 0 |
   | `SQ:` — saved queues | 0 |
   | `FV:2` — favorites | 4 (already shown by Warren) |
   | `R:0/0` — internet radio favorites | 1 |

   The linked music services — where YouTube Music and anything else the household uses actually live — are not reachable from the LAN at all. A browse UI built on this would show the favorites list Warren already has, which is why the feature is scoped to the queue instead.

3. **The queue is the part worth building.** It is the one content surface the local stack exposes that Warren does not already show, it fills whenever the user plays anything from a Sonos client, and it answers the actual want behind the request: seeing and changing what comes next without switching apps.

4. **Content selection stays in Sonos's clients, reached by a link.** This is what Home Assistant and comparable dashboards settle on for the same reason — the local surface cannot reach the services, so pretending otherwise produces a browse UI that is empty for most households. A link is honest and costs nothing.

5. **Move-up/move-down rather than drag-and-drop.** The wall panel is tap-only, and a drag gesture on a scrollable list competes with scrolling. Explicit controls are the more reliable interaction on touch.

6. **The fake must model the states that matter.** The merged Sonos work shipped a play button that was broken for rounds because the fake could not represent "stopped but loaded" — the one state the real speaker was in. This fake must cover a populated queue, an empty queue and a radio stream before the feature is called done.

## Open Questions

- ~~The mutations have not been exercised against real content.~~ **Resolved:** all three work against real hardware. Play-at-index needs `Play()` *before* `Seek`, because `Play()` on a stopped transport restarts at track 1; the speaker lags about a second before reporting the new track, so the client revalidates after a mutation.
- Should the queue dialog be reachable when the output is not a Sonos target? It is meaningless for the browser and Cast, which argues for offering it only on Sonos.
- A radio stream leaves the queue untouched from a previous session, so a stale queue may exist behind current playback. Should it be shown, or hidden while a stream is playing?
- Internet-radio favorites (`R:0/0`) are a separate container from `FV:2` and Warren currently ignores them. Worth folding into the favorites picker, or out of scope?
