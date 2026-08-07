# Feature Spec: Sonos Speaker Discovery

## Overview

Warren's music player can send audio to a Google Cast speaker, discovered on the LAN over mDNS and driven with the CASTV2 protocol. Sonos speakers are at least as common in the kind of home Warren runs in, and a user who owns them currently sees a Cast-only target list with no way to reach them. This feature adds Sonos speakers to the music configuration dialog: discovered on the LAN, listed alongside Cast targets, selectable as the player's output, and controllable once playing.

Sonos is a different device class, not a variation of Cast. It announces itself over SSDP rather than mDNS `_googlecast._tcp`, and it is controlled through UPnP SOAP calls on port 1400 rather than CASTV2 over TLS on 8009. None of the existing `lib/server/cast/` discovery or transport code applies. What generalises is the player's *target* concept; the protocol underneath does not.

Content works differently too, and this shapes the whole feature. Warren cannot hand a Sonos speaker a YouTube identifier the way it hands one to the Cast receiver — YouTube Music is a Sonos music service resolved against the user's linked Sonos account, not something a LAN controller can push. What a LAN controller *can* do is start a **Sonos Favorite**. So the user saves a YouTube Music playlist as a favorite in the Sonos app once, and from then on Warren can start it. This is exactly the pattern Home Assistant settled on, and it is what makes the Sonos target genuinely useful rather than a remote for audio someone else started.

## Goals

- Discover Sonos speakers on the LAN automatically and offer them in the music configuration dialog next to Cast speakers and the browser.
- Present a Sonos speaker as a first-class output target, named by its user-assigned room name.
- Start playback on a Sonos speaker by selecting one of the household's Sonos Favorites.
- Support transport and volume control, and show accurate now-playing state, for whatever the speaker is playing — whether Warren started it or not.
- Let a user add a Sonos speaker manually by IP when discovery cannot reach it, as Cast targets already allow.
- Keep the difference between Warren's YouTube library and the Sonos favorites list visible, so the user is never offered content that cannot start on the selected output.
- Reuse the existing target model, storage and picker rather than introducing a parallel notion of "speaker".

## Non-Goals

- Playing Warren's own saved YouTube Music sources directly on a Sonos speaker. Those remain browser- and Cast-only; on Sonos the content comes from Sonos Favorites.
- Any use of a Sonos account credential, OAuth flow, or the cloud Sonos Control API. All control is LAN-local.
- Creating, editing or deleting Sonos Favorites. Warren reads them; the Sonos app owns them.
- Forming, joining or breaking Sonos groups. Warren observes grouping and respects it, but does not change it.
- Multi-room synchronised playback, whether across Sonos speakers or between Sonos and Cast.
- Sonos line-in, TV audio, alarms, sleep timers, or EQ.
- Replacing or refactoring the Cast stack. Cast behaviour must be unchanged.

## User Stories

- As a user with Sonos speakers, I want them to appear in the music output picker without configuration, so that choosing where music plays does not depend on which brand of speaker I own.
- As a user, I want a Sonos speaker listed by the room name I gave it in the Sonos app, so that I recognise it immediately.
- As a user, I want to start one of my Sonos favorites from the dashboard, so that playing music in the kitchen is one tap rather than finding my phone and opening the Sonos app.
- As a user, I want to pause, skip and change the volume of whatever the speaker is playing, even if I started it from the Sonos app, so that the dashboard is a useful remote.
- As a user on a network where multicast is unreliable, I want to add a Sonos speaker by typing its IP, so that a discovery failure does not make the feature unusable.
- As a user who has grouped speakers in the Sonos app, I want the dashboard to reflect that grouping rather than fight it, so that pressing play does not produce sound in a room I did not expect.
- As a user who unplugs a speaker, I want it shown as unreachable rather than silently disappearing or appearing available, so that the picker reflects reality.

## Functional Requirements

### Discovery

- Sonos speakers are discovered on the LAN over SSDP, refreshed on a recurring sweep in the same spirit as the existing Cast sweep.
- Discovery runs in the server's background music subsystem, started at boot alongside the existing runtime, and stops cleanly on shutdown without leaking sockets or timers.
- A discovered speaker contributes its user-assigned room name, model, address and stable device identifier. The room name is what the UI shows.
- A speaker that stops answering sweeps is marked unreachable rather than deleted, so a briefly powered-off speaker does not vanish and reappear as a duplicate.
- Manually added speakers are never pruned by a sweep, matching manual Cast targets.
- Sonos and Cast discovery run independently; a failure in one must not stop the other.

### Grouping

- Sonos speakers bound into a group are represented by their group coordinator, not as independent targets. Selecting a member that is bound into a group would produce sound in every room of that group, which is not what the label implies.
- The target list shows one entry per group, labelled with the coordinator's room name and indicating the other rooms it includes.
- Ungrouped speakers appear individually.
- All commands are issued to the coordinator.
- When grouping changes in the Sonos app, the target list reflects it within one sweep. If the player's selected target stops being a coordinator, the player follows the group rather than silently continuing to address a member.

### Content: Sonos Favorites

- When the selected output is a Sonos target, the player's source picker lists the household's **Sonos Favorites** instead of Warren's YouTube Music library.
- Favorites are read live from the speaker and are not stored as Warren sources; the Sonos app owns that list and it may change at any time.
- Selecting a favorite starts it on the target and the player reports playing state.
- A favorite that fails to start surfaces the failure on the tile rather than leaving the player in a false playing state.
- Warren's YouTube Music sources remain visible and selectable for the browser and Cast targets, and are not offered on a Sonos target.

### Transport and state

- Supported controls on a Sonos target: play, pause, next, previous, stop, volume, and mute.
- Now-playing title, artist and position are read from the speaker and shown on the tile.
- When the speaker is playing something Warren did not start, Warren shows that state rather than claiming the speaker is idle — the same rule the Cast target follows.
- Playback state is read from the device rather than assumed from the last command sent.
- The existing rule that switching output moves the single player, rather than starting a second stream, applies to Sonos targets.

### Protocol posture

- Sonos local control is undocumented and unsupported by Sonos; it is the same category of dependency as `lib/server/cast/lounge.ts` and must carry the same discipline. Every call returns a typed failure instead of throwing, the surface used is kept as small as the feature allows, and a breakage degrades the Sonos target rather than taking the music player down.
- The code must be isolated so a future Sonos protocol change is contained to one directory.

### Failure behaviour

- An unreachable Sonos target selected as the player's output surfaces as offline, and the player offers to fall back to the browser rather than silently redirecting audio.
- A manual add that finds no Sonos speaker at the given address is rejected with a message saying so, rather than storing a target that will never work.
- Discovery failures are logged and leave previously known targets in place; they do not empty the picker.
- A speaker that answers discovery but refuses control is reported as an error state, not as idle.

## UI / UX

The music configuration dialog's target section lists Sonos speakers together with Cast speakers and the browser in one list — the user is choosing where sound comes out, and the protocol is an implementation detail. Each entry carries a quiet indication of its kind so a user with both ecosystems can tell them apart. A grouped Sonos entry names the coordinator's room and indicates the rooms it carries with it.

The source picker is output-dependent. With the browser or a Cast speaker selected it lists Warren's saved YouTube sources, as today. With a Sonos speaker selected it lists Sonos Favorites, with a short line explaining that favorites come from the Sonos app. The switch must be legible rather than surprising: the user should understand why the list changed, and that adding a YouTube playlist to Warren does not make it available on Sonos.

Unreachable speakers remain listed but visibly dimmed and non-selectable, consistent with offline Cast targets. The manual-add affordance accepts an IP address and reports success or failure inline.

The music tile's output label names the Sonos target exactly as the picker does, so what the tile says and what the user chose always match. The embedded YouTube player is not shown when the output is Sonos — there is no browser playback to display — and the tile falls back to its non-player artwork surface.

## Data Model

The existing music target record gains a notion of which protocol the target speaks, distinguishing Sonos from Cast. Existing rows are treated as Cast, so the migration produces no user-visible change.

A Sonos target stores the same shape of information as a Cast target — stable identifier, display name, network address, model, discovered-or-manual origin, last seen — plus the household and group identifiers needed to address the right coordinator and to detect when grouping has changed.

Sonos Favorites are **not** persisted. They are read from the speaker when the picker needs them and cached only for as long as is needed to render, because the Sonos app can change the list at any time and a stale copy would offer content that no longer exists.

The player's stored output preference and per-target volume continue to work unchanged, since both are keyed by target rather than protocol.

## API

- The endpoint that lists music targets returns Sonos targets alongside Cast ones, each carrying its protocol and, for grouped Sonos targets, the rooms in the group.
- A new endpoint lists the Sonos Favorites available for a given Sonos target.
- The existing command endpoint accepts the supported transport and volume commands for a Sonos target, and accepts a favorite as the thing to play.
- The endpoint that adds a target manually accepts a Sonos speaker, detecting what is at the given address rather than trusting the caller.
- The endpoint that removes a manually added target removes a Sonos one on the same terms, and still refuses to remove discovered entries.
- The discovery-trigger endpoint sweeps for Sonos as well as Cast.
- No new room-scoped endpoints. Music is a global component and its endpoints live under the music path.

## Acceptance Criteria

- [ ] A Sonos speaker on the LAN appears in the music output picker without configuration, labelled with its Sonos room name.
- [ ] Sonos and Cast speakers appear in one combined list, each distinguishable as to kind.
- [ ] Selecting a Sonos target switches the source picker to Sonos Favorites, with the reason visible to the user.
- [ ] Selecting a favorite starts it on the speaker, and the tile shows playing state with title and artist read from the device.
- [ ] Pause, next, previous, stop, volume and mute work on a Sonos target, including for audio started from the Sonos app.
- [ ] Grouped speakers appear as one entry named for the coordinator, listing the rooms included; commands reach the whole group.
- [ ] Changing grouping in the Sonos app is reflected in the target list within one sweep without creating duplicates.
- [ ] A Sonos speaker can be added manually by IP; a bad address is rejected with a clear message rather than stored.
- [ ] A manually added Sonos speaker survives a discovery sweep that does not see it.
- [ ] A powered-off Sonos speaker shows as unreachable and is not selectable; powering it back on restores it within one sweep without a duplicate entry.
- [ ] Selecting a Sonos target persists as the player's output and is still selected after a server restart.
- [ ] Warren's YouTube sources are never offered on a Sonos target, and Sonos Favorites are never offered on the browser or a Cast target.
- [ ] Cast discovery, Cast playback and browser playback are unchanged, verified by the existing music test suite passing untouched.
- [ ] The Sonos paths are exercisable in E2E without hardware on the LAN.
- [ ] Sonos discovery starting and stopping leaves no leaked sockets or timers across a server restart or a dev hot reload.
- [ ] Nothing in this feature is modelled as a sensor, and no Sonos device enters sensor discovery or the InfluxDB pipeline.

## Resolved Decisions

1. **Local UPnP on port 1400 is the control surface, and it is unsupported.** Sonos has never shipped a local Control API — the official one is cloud-only and OAuth-bound, and its LAN counterpart has been "not yet available" since 2020. The undocumented UPnP/SOAP interface on port 1400 is what every serious local integration uses (Home Assistant via SoCo, `node-sonos-http-api`, `node-sonos-ts`). Warren accepts that dependency because the alternative — holding the user's Sonos cloud credentials server-side — is a materially worse security posture for a LAN dashboard, and because the same trade-off is already made and documented for `lounge.ts` in the Cast stack. It carries the same containment rules.

2. **Content comes from Sonos Favorites, not from Warren's YouTube library.** A LAN controller cannot resolve YouTube Music content for Sonos; that is a cloud-side operation against the user's linked music services. Favorites are the standard escape hatch, and are what Home Assistant exposes (`media_content_type: favorite_item_id`, e.g. `FV:2/31`). The user saves a YouTube Music playlist as a favorite in the Sonos app once, and Warren can start it from then on. This makes the Sonos target a real output rather than a remote for someone else's audio, at the cost of one manual setup step that is honestly explained in the UI.

3. **Sonos stays modelled as an output target.** Because favorites make it startable, the target abstraction holds and no separate "speaker" concept is needed. Had it turned out to be remote-only, presenting it as a player output would have implied a capability it lacked — that was the reason to ask.

4. **Grouped speakers are addressed by their coordinator, and shown as one entry.** This is what Home Assistant and Music Assistant both do, and it matches the user's mental model: a group is one place sound comes out. Listing bound members separately would let a user pick "Kitchen" and hear music in four rooms.

5. **`@svrooij/sonos` (node-sonos-ts) is the library.** It is TypeScript-first, actively maintained, covers discovery and group topology through its `SonosManager`, and models logical (grouped) devices as first-class — which is precisely the hard part of decision 4. The older `bencevans/node-sonos` has known topology problems on modern firmware. Being pure JS/TS it needs no native build, but its SSDP discovery opens raw UDP sockets, so it must be added to `serverExternalPackages` in `next.config.ts` for the same reason `bonjour-service` is.

6. **A `WARREN_SONOS_FAKE` stub mirrors `WARREN_CAST_FAKE`.** The Cast work established that without a fake, the paths are untestable in CI and effectively unverified. The fake seeds a couple of speakers, one group and a favorites list, and stubs the UPnP layer.

## Open Questions

- What should happen to the player's state when a Sonos speaker is playing a source Warren did not start, and the user then selects a Warren favorite — does Warren take over silently, or confirm first? Cast's answer was last-write-wins; Sonos may warrant the same, but a speaker playing someone else's music in another room is a more visible interruption.
- Sonos Favorites include non-music entries such as radio stations and line-in sources. Should the picker show all of them, or filter to what behaves like a playlist?
- How should the tile render now-playing artwork for Sonos? The speaker provides an artwork URL, but the tile's artwork surface is currently the embedded YouTube player, which is absent on Sonos.
- Does the household concept need modelling explicitly? A home with two Sonos households on one LAN is rare but not impossible, and favorites are per-household.
