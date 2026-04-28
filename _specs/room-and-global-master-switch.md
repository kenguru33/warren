# Feature Spec: Per-Room and Global Master Light Switch

## Overview

Today, controlling many lights at once means tapping each tile individually — either on the room card (one room's lights) or on the Lights page (all lights). This feature adds two master switches: one per room that turns every light in that room on or off in a single action, and one global "all lights" switch that does the same across the whole system. Master switches are convenience shortcuts; per-light controls remain unchanged.

## Goals

- Provide a single per-room master switch that toggles every light in the room on or off.
- Provide a single global master switch that toggles every light in the system on or off.
- Show clear master state at both scopes: all-on, all-off, or mixed.
- Keep the operation best-effort: an unreachable light does not block the rest from responding.
- Work for any light Warren controls (today: Philips Hue lights via the existing integration).

## Non-Goals

- A "groups within a room" abstraction (covered by a separate feature). This spec only adds the two scoped masters: room and global.
- A master brightness slider at either scope. On/off only. Brightness stays per-light.
- Color or color-temperature sync. Not affected.
- Pushing the room or global concept back to the Hue Bridge as a Hue group. Warren-only control via existing per-light commands.
- Scenes, schedules, or automations on top of master switches.
- Master switches for non-light devices (cameras, sensors).

## User Stories

- As a user leaving a room, I want a single tap on the room card to turn off every light in that room, so that I don't have to tap each light tile.
- As a user going to bed, I want one tap from the Lights page (or a top-level toolbar) to turn off every light in the house, so that I don't have to walk through every room or tap many tiles.
- As a user coming home, I want one tap to turn on every light in a room (or every light) at the brightness each light last had, so that the room comes back to a familiar state.
- As a user, I want to see at a glance whether every light in a scope is on, off, or some mix, so that I know what the master switch will do next.
- As a user with one unreachable bulb, I want the master command to still affect the other bulbs and clearly tell me which ones didn't respond, so that one offline device doesn't block everything else.

## Functional Requirements

### Scope and membership

- "Per-room master" affects every light currently assigned to that room.
- "Global master" affects every light known to Warren that is currently assigned to a room. Unassigned/discovered lights are not part of the global scope.
- Blocked lights are excluded from both scopes.
- Lights flagged unreachable are still attempted by the master command (the bridge may queue or reject) and excluded from the displayed state computation.
- A light added to or removed from a room is automatically picked up by the next render of the master switches — no manual configuration of master scope.
- Rooms with zero lights show no per-room master. The global master is hidden when there are zero lights system-wide.

### Master command behavior

- A master ON command turns every in-scope light on at its individually-remembered last brightness (per-light state in Warren, i.e. the value most recently observed by the poller). Lights that do not support brightness simply turn on.
- A master OFF command turns every in-scope light off.
- The command fans out to each in-scope light through the existing per-light control path. There is no new bridge-level group concept.
- The operation is best-effort:
  - Reachable lights respond as expected.
  - Unreachable or failing lights are reported in a per-member summary, but do not abort the rest.
  - The master switch itself does not roll back the lights that succeeded if some failed.

### Master state

- Each master (per-room and global) displays one of: `all-on`, `all-off`, `mixed`.
- `mixed` is shown when at least one in-scope light is on and at least one is off.
- Unreachable lights are excluded from the on/off computation but contribute to a separate "n unreachable" indicator next to the master.
- When in-scope lights are zero (e.g. a room has no lights), the master is hidden rather than shown in an empty state.

### Sync behavior

- The displayed master state is computed from the per-light state that the existing poller already maintains. No new poll path is introduced.
- After the user actuates a master switch, the UI updates optimistically and reconciles with the next per-light state refresh.

### Concurrency and conflicts

- If a user actuates two masters in quick succession (e.g. room master, then global master), the later command wins for any overlapping light. There is no queue or locking; per-light commands settle in arrival order.
- Per-light controls remain available during and after a master command; tapping a single light tile after a master command updates only that light, leaving others as the master left them.

### Search and filtering

- The Lights page filters operate over individual light rows as today; the global master is not filtered (it remains a top-level affordance regardless of search).
- The per-room master is rendered with its room and is not affected by the search field on the Lights page.

## UI / UX

### Per-room master

- Surfaced on the room card as a small affordance in the header area, near the existing edit/add buttons. The exact placement should match the room card's visual rhythm without crowding the title.
- Visual state:
  - `all-on`: filled/active styling, label "All on".
  - `all-off`: muted/inactive styling, label "All off".
  - `mixed`: distinct in-between styling, label "Mixed".
- A subtle "n unreachable" indicator appears beside the toggle when any in-scope light is unreachable.
- Tapping the master:
  - From `all-on` → sends OFF.
  - From `all-off` → sends ON.
  - From `mixed` → sends ON (treats mixed as "make them all on"). The opposite behavior is reachable by tapping again.
- The master is hidden if the room has zero lights.

### Global master

- Surfaced as a top-level affordance on the Lights page (most natural home, since that page already lists every light) and as a compact toolbar control on the dashboard so it's reachable from the home screen too.
- Same three-state visual treatment and same `mixed → ON` first-tap behavior as the per-room master.
- Same "n unreachable" indicator when applicable.
- Hidden when there are zero lights system-wide.

### Feedback and errors

- Optimistic update: the master tile and each in-scope light tile flip immediately on tap; the UI reconciles with bridge state on the next refresh.
- Per-light failures from the master command are surfaced in two places:
  - Inline on the affected individual light tile (existing per-light error pattern).
  - As a small toast or summary near the master itself: "2 lights didn't respond" with a link/affordance to highlight or list them.
- No confirmation prompt for master-OFF (consistent with per-light toggle, which is also undoable). If the global master ends up being too easy to fire by accident, a follow-up iteration can add a confirm-on-large-scope guard — out of scope for v1.

## Data Model

- No new persistent storage is required. Master scopes are derived at read time from existing data (room → lights mapping and per-light state).
- API responses for room and system-wide views gain a master-state summary (state value, member count, unreachable count) so the UI does not need to compute it client-side from many tiles.
- Per-light response shapes are unchanged.

## API

- A new endpoint to drive a per-room master: identified by the room, accepts an on/off value, fans out to every in-scope light, returns a per-member success/failure summary plus the resulting computed room master state.
- A new endpoint to drive the global master: accepts an on/off value, fans out to every in-scope light system-wide, returns the same shape of summary plus the resulting global master state.
- Existing endpoints that return room or sensor data (`/api/rooms`, `/api/sensors`) gain a master-state summary at the appropriate scope without breaking existing fields.

## Acceptance Criteria

- [ ] A user can tap a per-room master and every light in that room turns on (or off) without further input.
- [ ] A user can tap the global master and every light in every room turns on (or off) without further input.
- [ ] Both masters correctly show `all-on`, `all-off`, or `mixed`, including after a single light is toggled individually outside the master.
- [ ] When at least one light is unreachable, the master command succeeds for the reachable lights and the master shows an "n unreachable" indicator.
- [ ] Per-light failures are surfaced both on the individual tile and as a summary near the master that triggered them.
- [ ] Per-light controls continue to work normally during and after master commands.
- [ ] Both master switches are hidden when their scope contains zero lights.
- [ ] The master state and per-light states stay in sync across stack restarts and the next poll cycle.
- [ ] Search and filtering on the Lights page do not affect the global master, and search does not affect per-room masters on the dashboard.

## Open Questions

- For the `mixed → first tap` direction, is "ON" the right default, or should it be "OFF" (since the most common pattern is "I'm leaving / going to bed")? Default in this spec: ON. Confirm.
- Should master-ON restore each light to its individually remembered last brightness, or to a fixed full brightness? Default: each light's last brightness, to avoid clobbering per-light tuning. Confirm.
- Should there be a confirmation step for the global OFF when the in-scope count is large (e.g. >10 lights)? Default: no, matching per-light tap behavior.
- Should unassigned/discovered lights be included in the global master scope? Default: no, since they aren't placed in any room and aren't part of the user's "house view". Revisit if requested.
- Should there be a keyboard shortcut for the global master (e.g. on the dashboard)? Out of scope for v1; flag for follow-up.
- Should an audit/log capture master events (who/when, success counts)? For a single-user home setup likely overkill, worth confirming.
- Future: should this feature be unified with the separate "light groups within a room" feature so the per-room master is just a "whole-room" group? Note for a future consolidation pass; not blocking v1.
