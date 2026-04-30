# Feature Spec: Light Group Lights Dialog

## Overview

Light groups are currently rendered as compact tiles in the room dashboard. The tile only exposes a master on/off toggle and a brightness slider that affect every light in the group at once — there is no way to see *which* lights belong to the group from the dashboard, and no way to control a single light without first ungrouping. This spec adds a click-to-open dialog that lists every light in the group and lets the user inspect and control each light individually, without leaving the dashboard.

## Goals

- Make the membership of a light group visible from the dashboard.
- Let the user toggle and dim individual lights inside a group without ungrouping.
- Keep the existing master-switch and group brightness behavior unchanged.

## Non-Goals

- No changes to how groups are created, edited, or deleted (that already lives in the existing edit/group flows).
- No reordering or reassigning of lights between groups from the dialog.
- No bulk multi-select inside the dialog (one light at a time is enough for v1).
- No change to the underlying group state model or to the room/group APIs that drive the tiles themselves.

## User Stories

- As a homeowner, I want to click a light group on the dashboard and see exactly which lights it contains, so that I can confirm which bulbs are about to be affected before I toggle the group.
- As a homeowner, I want to turn one light in a group on or off from the dialog, so that I can break out of the group temporarily without ungrouping it.
- As a homeowner, I want to dim a single light in a group, so that I can fine-tune lighting (e.g. a reading lamp) while keeping the rest of the group at the group level.
- As a homeowner, I want unreachable or offline lights to be visible inside the dialog, so that I understand why the group state shows "X of Y on" or "unreachable".

## Functional Requirements

### Opening the dialog

- Clicking the body of a `LightGroupTile` (the area outside the master toggle button and the brightness slider) opens the dialog.
- The master toggle button and the brightness slider keep their current behavior; clicks on those controls do **not** open the dialog.
- The edit / ungroup action buttons that appear in dashboard edit mode keep their current behavior; clicks on those do **not** open the dialog.
- A keyboard-accessible affordance (Enter / Space on the focused tile) opens the dialog as well.

### Dialog contents

- Title shows the group name.
- A subtitle or summary line shows the same "X of Y on" / "All on" / "All off" / "Offline" state used on the tile, plus the member count.
- Lists every light that belongs to the group, one row per light. Each row shows:
  - Light name
  - On/off state with an inline toggle
  - Brightness slider (only for lights that report brightness capability)
  - Reachability indicator when a light is unreachable
- Lights are listed in a stable order (e.g. by name) so that the order does not jump between renders.
- An empty group (zero members) shows a friendly empty-state message instead of an empty list.

### Interactions inside the dialog

- Toggling a single light only affects that light; the group master state recomputes from the live readings of all members.
- Dragging a single light's brightness slider only affects that light and follows the same throttle pattern used elsewhere in the UI so the bridge is not flooded.
- If a single-light command fails (e.g. bridge unreachable), the dialog surfaces an inline error on that row and the rest of the dialog stays usable.
- The dialog reflects state updates from the same polling source that drives the tiles, so toggling from outside the dialog (e.g. another device) updates the dialog rows in near real time.

### Closing the dialog

- The dialog can be closed via:
  - An explicit close button.
  - Clicking the backdrop / outside the dialog.
  - Pressing Escape.
- Closing the dialog does not undo any actions taken while it was open.

## UI / UX

- The dialog is a modal overlay consistent with other modals already used in the dashboard (matching dark theme, border-radius, spacing).
- The tile gains a hover / focus affordance (cursor pointer, subtle hover highlight) so it is discoverable that the tile is clickable.
- The toggle button and slider keep clear hit areas; click events on them do not bubble up to open the dialog.
- The list inside the dialog is scrollable when there are more lights than fit on screen.
- Per-row controls match the look and feel of the existing per-light controls used elsewhere in the room view.
- The dialog respects the group's color theme (the same theme used to color the tile) so it visually belongs to that group.

## Data Model

No schema changes. The dialog is built from data already exposed by the existing room / sensor APIs that drive the tile and its members. No new tables, columns, or migrations.

## API

No new endpoints. The dialog reuses the existing per-light state endpoints already used by the individual light tiles (toggle on/off, set brightness). The group-level endpoints used by the master toggle and group brightness slider are unchanged.

## Acceptance Criteria

- [ ] Clicking a light group tile (away from the toggle and slider) opens a modal dialog.
- [ ] Clicking the master toggle still toggles the whole group and does not open the dialog.
- [ ] Dragging the group brightness slider still dims the whole group and does not open the dialog.
- [ ] The dialog lists every member light with its name, on/off state, brightness slider (when supported), and reachability state.
- [ ] Toggling a single row turns only that light on or off.
- [ ] Adjusting a single row's brightness only affects that light and is throttled.
- [ ] Toggling a single light from the dialog updates the group's "X of Y on" / mixed / all-on / all-off state without requiring a manual refresh.
- [ ] The dialog can be closed with the close button, backdrop click, and Escape.
- [ ] An empty group shows an empty-state message instead of an empty list.
- [ ] Per-row errors (e.g. bridge unreachable) are surfaced on the failing row only and do not block other rows.

## Open Questions

- Should the dialog also expose color / color-temperature controls per light, or is on/off + brightness enough for v1?
- Should the dialog include a quick action to remove a single light from the group, or is that strictly an edit-mode concern?
- Should we keep the existing "edit group" pencil button on the tile, or move that affordance into the new dialog header?
- On mobile, should the dialog render as a bottom sheet instead of a centered modal for better one-handed use?
