# Feature Spec: YouTube Music Component

> ## Amendment: the player is global, not per-room
>
> This spec was written for a **per-room** music tile, and the first
> implementation built it that way. It has since been changed to a **single
> global player**: one source library, one output target, and one playback
> state for the whole house, rendered on the dashboard beside the room grid
> rather than inside a room card.
>
> Everything below still describes the source-of-truth behaviour for *playback*
> — targets, browser-vs-cast ownership, terms compliance, error states — but
> read every "per room" as "for the player", with these consequences:
>
> - **Enabling music** is a dashboard action, not a room tile-menu action.
>   Rooms have no music affordance at all, and `RoomWithSensors` carries no
>   music field.
> - **The source library is global** and capped once (12), not per room.
> - **`taken-over` no longer exists.** It arbitrated two rooms competing for one
>   speaker; a single player cannot contend with itself. Switching output moves
>   the player and closes the previous device's session.
> - **Schema**: `music_config` (single row) replaces `room_music`;
>   `music_sources` and `music_volume` lost their `room_id`. `initDb()` migrates
>   existing data by merging every room's sources into one library, de-duplicated
>   by `content_id`.
> - **Endpoints** moved from `/api/rooms/{id}/music/*` to `/api/music/*`.

## Overview

Warren currently models a room as a set of environmental and lighting devices — temperature, humidity, motion, cameras, Hue lights and light groups. A room is somewhere you *are*, but there is nothing in the dashboard that makes a room feel lived in rather than merely instrumented. This feature adds music: a YouTube Music tile that sits inside a room card alongside the climate and light tiles, so that turning on the music in a room is the same kind of gesture as turning on the lights.

The tile plays audio in the browser by default — whatever device is showing the dashboard (phone, tablet, wall panel) becomes the speaker. It can also hand playback off to an external cast-capable speaker on the LAN, so a user standing at a wall panel can start music that comes out of the kitchen speaker rather than the panel itself. Warren then acts as a remote: showing now-playing metadata and transport controls for audio it is not itself producing.

An important constraint shapes this whole feature: **YouTube Music has no official public playback API.** What is officially supported is the YouTube IFrame Player API, which plays YouTube content in an embedded player. This works for YouTube Music because YouTube Music content is addressed by ordinary YouTube identifiers — a YouTube Music playlist URL carries a `list=` playlist ID, an album carries an `OLAK5uy_…` playlist ID, and a track is a `watch?v=` video ID. The embed can therefore play YouTube Music playlists, albums and tracks without touching any unofficial or reverse-engineered endpoint. This spec commits to that supported surface. Section *Resolved Decisions* records the consequences, which are real and constrain the design.

## Goals

- Give each room an optional music tile that starts, pauses, skips, and adjusts the volume of YouTube Music content, styled consistently with the existing climate, motion and light tiles.
- Let a user play music through the browser showing the dashboard, with no extra hardware or account setup beyond signing in to YouTube in that browser.
- Let a user hand playback off to a cast-capable speaker on the LAN, and show accurate now-playing state for that external target.
- Let a user save a small set of named sources per room (a playlist, a station, an album) so starting music is one tap rather than a search.
- Persist the per-room music configuration — the saved sources, the last-used output target, the last volume — so a room's music setup survives reloads and restarts.
- Keep the tile honest about state: when Warren cannot know what an external target is playing, the tile says so rather than showing stale metadata.
- Degrade cleanly when no cast target exists on the network, or when the browser blocks autoplay.

## Non-Goals

- Building a general music library, search-everything, or browse-the-catalog experience. Sources are configured ahead of time; the tile is a player, not a client.
- Supporting music services other than YouTube Music (Spotify, Apple Music, Plex, local files). The data model should not actively prevent a second provider later, but no second provider is built here.
- Multi-room synchronized playback (the same track in phase across several speakers). Each room's target is independent.
- A queue editor, drag-to-reorder, "add to queue", or any playlist mutation. Warren does not write to the user's YouTube Music account.
- Lyrics, artist pages, recommendations, radio-seeding, or history/scrobbling.
- Storing, proxying, caching, or re-encoding any audio or video stream on the Warren server.
- Handling YouTube account credentials on the server. Whatever session the browser already has with YouTube is what is used.
- Automation — no "play music when motion is detected", no schedules. Playback is user-initiated.
- Tying music state into the InfluxDB time-series pipeline. Music is state, not sensor history.
- Unofficial, reverse-engineered YouTube Music clients (InnerTube, `ytmusicapi`-style libraries). They break without notice and carry terms-of-service exposure; the officially supported embed is used instead.
- Cast protocols other than Google Cast — DLNA/UPnP, AirPlay, Sonos, Squeezelite. Google Cast is the only target class in this feature.
- The user's private YouTube Music library, uploads, "liked songs", or personalized radio **on a cast target**. Cast playback is anonymous (see *Resolved Decisions*); those sources work on the browser target only.

**Deployment constraint — the dashboard must be served from a hostname, not a bare IP.** YouTube refuses to embed licensed music content when the embedding origin is an IP address: the IFrame API reports error `150` ("owner does not allow embedded playback") and the player renders "Video unavailable", even for public, embeddable content. The same content plays from `localhost` (a privileged origin for YouTube) and from any DNS name, including an mDNS `.local` name — which is why this is invisible in development and only appears on a LAN deployment reached by IP. `WARREN_HOSTNAME` must therefore be set, its name carried as a DNS SAN on the local-CA leaf cert, and the dashboard loaded by that name. Unrestricted uploads are unaffected, so a partial failure where "some videos play and music doesn't" is the signature of this.

## User Stories

- As a user in the living room, I want to tap play on the room's music tile and hear the playlist I always listen to, so that starting music takes one gesture instead of unlocking my phone and opening an app.
- As a user at a wall-mounted tablet in the hallway, I want to start music that comes out of the kitchen speaker rather than the tablet, so the audio plays where the people are.
- As a user, I want to see what is currently playing and be able to skip a track, so I can act on the music without leaving the dashboard.
- As a user setting up a room, I want to save two or three sources with recognizable names, so that later I am choosing between "Dinner" and "Focus" rather than pasting URLs.
- As a user, I want to adjust the volume of the room's music from the dashboard, so I do not have to walk to the speaker or find the remote.
- As a user with no cast devices on my network, I want the tile to work anyway as a browser player, so the feature is useful without extra hardware.
- As a user who does not want music in a room, I want the tile absent rather than empty, so rooms without music stay uncluttered.

## Functional Requirements

### Enabling Music in a Room

- A room has no music tile by default. The tile appears only once music has been configured for that room.
- The room's existing tile menu gains an entry to add music to the room, which opens the music configuration dialog.
- The same dialog is reachable later to edit or remove the room's music configuration.
- Removing music from a room stops any playback that room owns, removes the tile, and deletes the room's saved sources and target preference.
- Music configuration is per-room and independent: configuring music in one room does not affect any other room.

### Sources

- A room holds an ordered list of saved sources. Each source has a user-supplied display name and a reference to YouTube Music content (a playlist, album, or track).
- The user adds a source by pasting a YouTube Music or YouTube URL. Warren extracts the content identifier and the kind of content it refers to.
- A pasted URL that Warren cannot recognize is rejected at the point of entry with a message explaining what forms are accepted, and the dialog stays open with the input preserved.
- Sources can be renamed, reordered, and deleted.
- A reasonable upper bound is enforced on saved sources per room (target: 12) so the tile's source picker stays glanceable.
- One source may be marked as the room's default — the one that plays when the user presses play without choosing.
- If a source becomes unplayable (deleted playlist, region-blocked, made private), attempting to play it surfaces an error on the tile and the source is visibly marked as unavailable in the picker. It is not silently skipped or auto-deleted.

### Output Targets

- The tile offers a choice of output target: **this device** (browser playback) or any discovered cast-capable speaker on the LAN.
- **This device** is always available and is the default when no target has been chosen.
- Warren discovers cast targets by browsing for the `_googlecast._tcp` mDNS service on the local network and offers them in the target picker, each with its friendly name. Discovery runs in the background and re-scans periodically (target: every 60 s); the list is not required to be instantaneous.
- **mDNS requires link-local network access, which Docker's default bridge network does not provide.** Whichever process runs discovery must be on the host network, or the deployment must supply an mDNS reflector. This is a setup requirement, not something the code can work around, and it must be documented in the `docker/` setup notes.
- Because discovery can fail for network reasons that have nothing to do with the speakers, the configuration dialog also accepts a **manually entered target IP address**. A manually added target is persisted, is not removed when a discovery sweep fails to see it, and is visually distinguished from a discovered one.
- The discovered-target list is shared across rooms — the same speaker can be offered to, and used by, more than one room. A room stores which target it prefers, not exclusive ownership of it.
- The room's chosen target is persisted and preselected the next time the tile is used.
- If a room's remembered target is no longer reachable, the tile indicates the target is offline and falls back to offering **this device**, without silently redirecting audio to the browser.
- Switching target mid-playback stops playback on the old target and starts the same source on the new one. Resuming at the same position is desirable but not required; if position cannot be carried over, playback restarts from the beginning of the current track and the tile does not pretend otherwise.
- When no cast targets are discovered, the target picker is hidden or shown as a single disabled entry rather than presenting an empty menu.

### Playback Control — Browser Target

- Playback happens in an embedded YouTube IFrame player owned by the dashboard client.
- Playback must be initiated by a user gesture; the tile never attempts to autoplay on page load.
- **The player is visible, not hidden.** The embed's viewport is at least 200×200 px, per YouTube's Required Minimum Functionality terms. The player rectangle doubles as the tile's artwork surface — the video plays where album art would otherwise sit. Warren does not hide the player off-screen, size it below the minimum, or reduce it to an audio-only element.
- **Nothing is drawn on top of the player.** YouTube's terms prohibit overlays that obscure any part of an embedded player, including its controls. Warren's own transport controls, now-playing text and volume slider sit outside the player rectangle — below or beside it — never over it.
- Supported controls: play, pause, next track, previous track, seek within the current track, and volume.
- **YouTube Premium is assumed** on the account signed in to the viewing browser. Premium is what makes this feature pleasant: no ad interruptions between tracks, and continued playback when the tab is backgrounded. Warren does not verify Premium status and does not degrade differently without it — a non-Premium user simply gets ads, which is a YouTube behavior, not a Warren feature.
- Browser playback uses whatever YouTube session that browser already has. A signed-in user reaches their own library, uploads and personalized playlists; an anonymous browser reaches public content only.
- Backgrounded and screen-locked playback is a browser behavior Warren cannot control. iOS Safari in particular suspends embedded iframe playback when the screen locks, regardless of Premium. The wall-panel use case should assume a screen that stays awake.
- Now-playing metadata (title, artist where available, artwork where available, elapsed and total time) is read from the player and shown on the tile.
- Only one room may hold browser playback at a time within a single dashboard client. Starting playback in a second room stops the first, and the first room's tile reflects that it is no longer playing.
- Browser playback is local to that browser tab. Two different devices viewing the dashboard can each be playing something; neither is shown as the other's state.

### Playback Control — Cast Target

- **Protocol: Google Cast (CASTV2), driven server-side.** Warren opens a TLS connection to the device on port 8009 and speaks the CASTV2 protocol directly, rather than using the browser-side Cast Sender SDK. This is what makes cast playback shared across dashboard clients and independent of any open tab, and it matches the established home-automation precedent (Home Assistant drives Cast devices the same way).
- Selecting a cast target and pressing play launches the YouTube receiver app on the device and hands it the source's YouTube identifier.
- **Cast playback is anonymous.** The server holds no YouTube credentials, so the receiver plays as a signed-out client. Two consequences the UI must be honest about: ads may play on a cast target even though the user has Premium in their browser, and private or library-only content will not play. Sources that fail to resolve anonymously are marked **browser-only** in the source picker rather than appearing to be broken.
- Supported controls: play, pause, next track, previous track, and volume — issued to the target, not to the browser.
- **State arrives by push, not polling.** The CASTV2 connection is long-lived and the device sends `RECEIVER_STATUS` and `MEDIA_STATUS` updates as things change; a heartbeat keeps the socket alive. Warren connects lazily — only to targets some room actually prefers — and drops the connection when no room references the target. A low-frequency reconciliation poll (10 s, matching the Hue runtime cadence) is acceptable as a backstop if push updates prove unreliable, but must not be the primary mechanism.
- The tile reflects the actual state of the device, including changes made from outside Warren (someone using the speaker's own app or a voice command).
- When the target reports playback that Warren did not start, the tile shows that state rather than claiming the room is idle.
- When the target's state cannot be read, the tile shows an explicitly unknown state — not a stale snapshot and not a fabricated idle state.
- Commands that the target rejects or does not support surface as a transient error on the tile; the tile then re-reads the target's real state rather than optimistically assuming the command took effect.
- Cast playback is server-mediated and therefore shared: every dashboard client viewing that room sees the same cast playback state.
- **One speaker, two rooms: last write wins.** If a second room starts playback on a target another room is already using, the second room takes it over. This mirrors how Google Cast itself behaves — a new sender displaces the old one — so Warren does not invent a locking scheme the device would ignore. The displaced room's tile updates to show it no longer holds the target, naming the room that took it.
- **The output is always named.** Whether audio is coming from the browser or a speaker, the tile states where it is going ("This device", "Kitchen"). The browser/cast asymmetry is made visible rather than hidden behind a single unified "the room is playing" idea, because the two states genuinely differ in who can control them.
- Browser playback is private to the tab that started it. Other dashboard clients show that room as idle — they cannot see or control that audio, and must not imply otherwise.

### Tile States

The tile has a small number of clearly distinguishable states:

- **Idle** — nothing playing. Shows the room's default source name and a play control.
- **Playing** — shows now-playing metadata, elapsed/total time, transport controls, and which output the audio is going to.
- **Paused** — as playing, but visually distinct and with a resume control.
- **Loading** — a command has been issued and the result is not yet known. Bounded by a timeout, after which the tile moves to error rather than spinning indefinitely.
- **Target offline** — the room's remembered target is unreachable; explains the situation and offers to switch to this device.
- **Unknown** — a cast target is selected but its state cannot be read.
- **Taken over** — another room has claimed this room's cast target; names the room that took it and offers to switch to this device.
- **Error** — the last command or the last source failed, with a short human-readable reason and a way to retry.
- **Unsupported browser** — the IFrame player failed to load. Offers a deep link to open the source in YouTube Music instead.

The supported browser target is the current and previous major version of Chrome, Edge, Safari and Firefox. Older wall-panel tablets outside that range get the *unsupported browser* state rather than a silently broken player.

### Persistence and Defaults

- Rooms configured before this feature have no music configuration and no tile; nothing about their existing behavior changes.
- Volume is remembered per room per target, so the browser and the kitchen speaker do not fight over one shared number.
- Removing a room removes its music configuration.
- Music configuration is included in the existing config backup and restore, consistent with how rooms, sensors and light groups are already handled.

### Authentication and Access

- Any new Warren API route added for this feature sits behind the existing session-based auth proxy. None of them are device-facing, so none are added to the proxy's public lists.
- Warren does not collect, store, or proxy YouTube account credentials. Browser playback relies on whatever YouTube session the viewing browser already has; a user who is not signed in gets whatever the embed allows for an anonymous viewer, including ads.

## UI / UX

**Music tile (in the room card).** A new tile rendered in the room card's tile grid, alongside `ClimateTile`, `MotionTile`, `CameraTile`, `HueLightTile` and `LightGroupTile`, and following the same Catalyst-pattern conventions: semantic color tokens (`bg-surface`, `text-text`, `text-subtle`, `ring-default`, `bg-accent-soft`), rounded tile surface, and a consistent tile header. Layout: now-playing text (title, and artist when known) with optional artwork, a transport row (previous / play-pause / next), a progress indication, a volume control, and an output-target affordance showing where the audio is going.

Auto-hiding controls — if any are used — must use the `pointer-fine:` variant rather than plain `group-hover`, so touch devices (the wall-panel case, which is central to this feature) keep the controls visible.

**Source picker.** A compact menu on the tile listing the room's saved sources by name, with the default indicated and unavailable sources visibly marked. Selecting a source starts it on the current target.

**Output target picker.** A menu listing "This device" plus discovered and manually added cast targets, with reachability indicated and manually added entries distinguished. Hidden or collapsed to a disabled single entry when nothing but the browser is available. The currently selected output is always named on the tile face, not only inside the menu.

**Music configuration dialog.** A modal, consistent with the existing `add-sensor-modal` / `edit-light-modal` family, for managing the room's sources (add by URL, rename, reorder, delete, mark default) and removing music from the room. Entered from the room's existing tile menu.

**Embedded player surface.** Browser playback needs a real, visible player element of at least 200×200 px. It is integrated deliberately as the tile's artwork surface — the video sits where album art would, at or above the minimum size. Warren's own controls are laid out around it, never on top of it, since overlaying an embedded player is prohibited. On narrow layouts the tile grows to keep the player at its minimum size rather than shrinking the player below it. The player element is mounted only while that room owns browser playback; an idle tile shows static artwork or a placeholder instead.

**Responsiveness and touch.** Transport controls are sized for touch, since the primary use case is a phone or a wall-mounted tablet. The tile must not overflow the room card at narrow widths; secondary controls collapse before primary ones do.

## Data Model

New SQLite tables, created in `initDb()` following the existing `CREATE TABLE IF NOT EXISTS` convention, with millisecond-integer timestamps:

- **`room_music`** — one row per room that has music configured. Holds the room reference, the preferred output target, and last-updated state. Deleting a room deletes its row.
- **`music_sources`** — the saved sources for a room: display name, content kind (playlist / album / track), the extracted YouTube content identifier, sort position, default flag, an availability marker for sources found to be unplayable, and a browser-only marker for sources that will not resolve anonymously on a cast target.
- **`music_targets`** — cast targets on the LAN: a stable target identifier, friendly name, network address, capability information, whether the entry was discovered or manually added, and when it was last seen. Shared across rooms. Discovered rows are a cache of what mDNS saw and may be pruned; manually added rows are user-authored configuration and are never pruned by a discovery sweep.
- **`music_volume`** — remembered volume per (room, target) pair, so browser and speaker volumes are independent.

Cast playback state (what a target is currently playing) is **runtime state, not schema** — held in the server-side runtime and re-read from the device, in the same spirit as `heaterActive` / `fanActive` being computed rather than stored. The `hue_light_state` cache is the precedent for caching device state if polling proves too slow to render from directly; if such a cache is added it must be clearly a cache, with staleness visible to the tile.

Shared types in `lib/shared/types.ts` (imported by both client and server) gain the music view types, and `RoomWithSensors` gains an optional music field alongside `sensors` and `lightGroups`. Music is deliberately **not** modeled as a `SensorType` — a player is not a sensor, produces no readings, and must not enter the InfluxDB history pipeline or the sensor-discovery merge.

A background cast runtime follows the Hue precedent: started from `lib/server/boot.ts` (invoked by `instrumentation.ts`), gated on the Node runtime, with its state cached on `globalThis` so dev HMR does not leak resources, and shut down on SIGTERM/SIGINT. It owns two things the Hue runtime does not: the periodic mDNS discovery sweep, and a set of long-lived CASTV2 sockets. **Both the sockets and the mDNS browser must be closed on HMR and on shutdown** — a leaked TLS socket to a speaker is worse than a leaked timer, because the device holds the connection open and eventually refuses new senders.

## API

All routes are session-authenticated via the existing proxy; none are added to the public lists.

- `GET /api/rooms/{id}/music` — the room's music configuration: sources, preferred target, current playback state.
- `PUT /api/rooms/{id}/music` — create or update the room's music configuration (preferred target, settings).
- `DELETE /api/rooms/{id}/music` — remove music from the room, stopping any playback it owns.
- `GET /api/rooms/{id}/music/sources` — list the room's saved sources.
- `POST /api/rooms/{id}/music/sources` — add a source from a pasted URL; resolves and validates the URL, rejecting unrecognized forms.
- `PATCH /api/rooms/{id}/music/sources/{sourceId}` — rename, reorder, or set as default.
- `DELETE /api/rooms/{id}/music/sources/{sourceId}` — remove a source.
- `POST /api/rooms/{id}/music/command` — issue a transport command (play / pause / next / previous / seek / volume, optionally naming a source) against the room's current target. For cast targets this reaches the device; for the browser target it records intent and returns the state the client should apply.
- `GET /api/rooms/{id}/music/state` — current playback state for the room, including an explicit unknown/stale indication.
- `GET /api/music/targets` — cast targets (discovered and manual) with reachability.
- `POST /api/music/targets/discover` — trigger an immediate mDNS sweep rather than waiting for the next scheduled one.
- `POST /api/music/targets` — manually add a target by IP address, for networks where mDNS does not reach the server.
- `DELETE /api/music/targets/{targetId}` — remove a manually added target.

Existing room endpoints that return `RoomWithSensors` include the room's music summary so the dashboard renders the tile on first paint without a second round trip.

## Acceptance Criteria

- [ ] A room with no music configured shows no music tile, and no existing room behavior changes.
- [ ] Music can be added to a room from the room's tile menu, and removed again — removal stops playback and deletes the room's sources.
- [ ] A YouTube Music playlist, album, and track URL can each be saved as a named source; an unrecognized URL is rejected with a clear message and the input is preserved.
- [ ] Sources can be renamed, reordered, deleted, and marked as the room's default; the source cap is enforced.
- [ ] Pressing play with the browser target selected starts audio in that browser, initiated by the user's gesture, with no autoplay on page load.
- [ ] Play, pause, next, previous, seek and volume all work for browser playback, and now-playing metadata matches what is actually playing.
- [ ] Starting playback in a second room within the same dashboard client stops the first room's playback, and the first tile reflects that.
- [ ] Cast targets on the LAN are discovered and offered in the target picker with reachability shown.
- [ ] Selecting a cast target and pressing play produces audio from that speaker and none from the browser.
- [ ] Transport and volume commands issued to a cast target take effect on the device, and the tile reflects the device's real state — including playback started outside Warren.
- [ ] Changing the target mid-playback moves the audio; if playback position cannot be carried over, the tile does not display a false position.
- [ ] A remembered target that is offline produces an explicit offline state with an offer to switch to this device — audio is never silently redirected.
- [ ] When cast state cannot be read, the tile shows an unknown state rather than stale or fabricated metadata.
- [ ] A failed command surfaces an error and the tile re-syncs to the device's actual state rather than assuming success.
- [ ] Every tile state (idle, playing, paused, loading, target offline, unknown, taken over, error, unsupported browser) is reachable and visually distinguishable; loading is bounded by a timeout.
- [ ] The embedded player is visible at 200×200 px or larger, and no Warren control, label or gradient is drawn on top of the player rectangle at any breakpoint.
- [ ] The tile face always names the current output, and browser playback in one client does not appear as active state in another client.
- [ ] A source that will not resolve anonymously is marked browser-only rather than presented as broken, and selecting it on a cast target explains why.
- [ ] A second room claiming a target already in use takes it over, and the displaced room's tile says which room took it.
- [ ] Cast state updates arrive by push: a track change or a volume change made from the speaker's own app is reflected without waiting for a reconciliation poll.
- [ ] A cast target can be added manually by IP, survives a failed discovery sweep, and is distinguishable from a discovered target.
- [ ] A source that has become unplayable surfaces an error and is marked unavailable in the picker rather than silently skipped.
- [ ] Volume is remembered independently per room per target and restored on return.
- [ ] Preferred target, sources, and volume survive a full server restart.
- [ ] With no cast targets on the network, the tile works as a browser player and the target picker does not present an empty menu.
- [ ] The tile is usable by touch on a phone and a wall-mounted tablet; auto-hiding controls use `pointer-fine:` and remain visible on touch devices.
- [ ] The tile renders correctly in light and dark mode and across all six color schemes, using semantic color tokens.
- [ ] Deleting a room removes its music configuration; config backup and restore round-trips it.
- [ ] All new API routes require a session; none are added to the proxy's public lists.
- [ ] The cast runtime starts from `bootServer()`; repeated dev HMR reloads leak neither timers, mDNS browsers, nor CASTV2 sockets, and everything closes cleanly on SIGTERM/SIGINT.
- [ ] Music does not appear in sensor discovery, the sensors list, or the InfluxDB history pipeline.
- [ ] E2E coverage exists for: adding music to a room, saving and playing a source, switching output target, and the target-offline path.

## Resolved Decisions

Each decision below takes the conventional, widely-used option and is already reflected in the requirements above. Recorded here so the reasoning is not lost.

1. **Use the YouTube IFrame Player API; no unofficial clients.** YouTube Music content is addressed by ordinary YouTube playlist and video IDs, so the supported embed can play YouTube Music playlists, albums and tracks directly. Reverse-engineered InnerTube clients are rejected: they break without notice and carry terms-of-service exposure that a home dashboard should not take on.
2. **YouTube Premium is assumed** on the browser-side account (per the user's decision). This buys ad-free playback and continued playback when the tab is backgrounded. Warren neither checks nor enforces it; without Premium the user simply gets ads.
3. **The player is visible, sized ≥ 200×200, with nothing drawn over it.** YouTube's Required Minimum Functionality terms set the 200×200 floor and prohibit overlays obscuring any part of an embedded player. Rather than fight this, the player becomes the tile's artwork surface and Warren's controls sit around it. Hiding the player to fake an audio-only experience is the common hack and is explicitly not done here.
4. **Google Cast (CASTV2), driven server-side.** The standard choice for Google-ecosystem speakers and the same approach Home Assistant takes. Server-side rather than the browser Cast Sender SDK, because cast state must be shared across dashboard clients and outlive any open tab. DLNA/UPnP and AirPlay are out of scope.
5. **Cast playback is anonymous, and the UI says so.** The YouTube receiver can be driven without credentials, which is why casting works at all with no YouTube login on the server — but it means cast playback may carry ads and cannot reach private or library-only content. The alternative, holding the user's YouTube credentials server-side, is a materially worse security posture for a marginal gain. Sources that only work signed-in are marked browser-only.
6. **Discovery via mDNS `_googlecast._tcp`, with a manual add-by-IP fallback.** The fallback is not optional polish: Warren's Docker deployment means the discovering process may not have link-local access, and every mature home-automation tool ships a manual path for exactly this reason.
7. **Push-based state over a long-lived CASTV2 connection**, not polling. The protocol pushes `RECEIVER_STATUS` / `MEDIA_STATUS` on change, so polling would be both slower and noisier. A 10 s reconciliation poll remains as a backstop only.
8. **Last-write-wins when two rooms want one speaker.** This is how Cast itself behaves — a new sender displaces the old — so a Warren-side lock would be a fiction the device ignores. The displaced room is told what happened.
9. **The output is always named, and the browser/cast asymmetry stays visible.** Browser playback is private to its tab; cast playback is shared. Presenting one unified "the room is playing" would mean lying to every client that cannot actually control the audio. Naming the output follows the Spotify Connect / Google Home convention users already know.
10. **Evergreen browsers only** — current and previous major version of Chrome, Edge, Safari, Firefox — with an explicit *unsupported browser* tile state and a deep link out to YouTube Music, rather than a silently broken player on an old wall-panel tablet.
11. **Source cap stays at 12**, for picker glanceability. Arbitrary but harmless, and trivially raised later.

## Open Questions

- **Node CASTV2 library choice.** `castv2` / `castv2-client` are the established implementations, but the ecosystem is not actively maintained and the YouTube receiver is driven through the separate "lounge" protocol rather than the Default Media Receiver. Whether to depend on an existing package or implement the small slice of the protocol Warren needs is an implementation-time call, and should include a look at how current the candidates are.
- **How to detect that a source is browser-only.** Marking a source as unplayable-when-anonymous may require actually attempting it on a target once and observing the failure, rather than knowing up front from the URL. The detection strategy is unresolved.
- **Whether the cast half should ship in a second pass.** Browser playback is self-contained and low-risk; cast adds mDNS, a socket runtime, Docker networking requirements and the anonymous-playback caveat. Splitting delivery is worth considering during planning, though the feature is specified here as a whole.
- **Volume semantics across targets.** Cast device volume is a device-level setting that other apps also change; browser volume is player-level. Remembering them separately is specified, but whether Warren should write device volume at all — versus only reading it — deserves a second look.
