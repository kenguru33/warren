# Feature Spec: Better Room Editing UX

## Overview

The dashboard's editing and management flows have grown organically and now feel inconsistent: clicking a tile sometimes opens history, sometimes opens a detail dialog, sometimes does nothing; "Edit room" is a global mode toggle that hides/shows different affordances on different tiles; grouping lights requires entering edit mode, scrolling to the bottom of a card, then picking lights from a checkbox list with no visual relationship to the tiles you can see; sensor labels are edited from the `/sensors` page list, not from the dashboard tile that shows the same sensor. None of these flows are wrong individually, but together they don't form a coherent mental model of "how do I change something about this room". This spec is a redesign of those interactions to make the dashboard's editing surface feel direct, consistent, and obvious.

## Goals

- Define **one canonical interaction pattern** for editing each kind of item (room, sensor tile, light tile, light group) so users don't have to remember which mode toggles which affordance.
- Make editing affordances **discoverable in place** — you should be able to start editing a thing by interacting with the thing itself, not by entering a separate mode and hunting for the right control.
- Replace the current global "Edit room" mode with **per-item entry points** so the user only sees the controls relevant to what they want to change.
- Redesign the **light-grouping** flow so it feels like "I'm picking lights from this room" rather than "I'm filling in a form with a checkbox list".
- Unify what **clicking a tile** does, with predictable rules: primary tap on a tile = primary action for that tile type; secondary actions are reachable via a clear secondary affordance, not via mode-toggling.
- Remove the friction of having to **switch pages** to do common edits (renaming a sensor, changing its room, hiding it) — the most common edits should be reachable from the dashboard tile.

## Non-Goals

- No new sensor types, light types, or device integrations.
- No data-model or API changes (existing endpoints already support every edit; this is purely a UI workflow redesign).
- Not a redesign of the `/sensors` and `/lights` management pages — those stay as the inventory views; the dashboard gets the in-place edits.
- Not changing what each modal *does*; if anything, modals consolidate so there are fewer of them, but their underlying actions stay the same.
- Not introducing drag-and-drop. Touch-and-click only — drag would be a separate, larger initiative.
- Not changing the sidebar, top bar, color scheme system, or theme handling.

## User Stories

- As a user looking at a room card, I want to long-press / right-click / tap-and-hold a tile to get its actions (rename, change room, configure, remove) without entering a separate "Edit room" mode.
- As a user wanting to rename a room, I want to tap the room name and type the new name inline — no mode toggle, no modal.
- As a user wanting to set a target temperature for a room, I want to tap the climate tile's reference value and edit it inline (or open a small editor) — without rendering target sliders for every climate tile in every room when only one room needs editing.
- As a user wanting to group lights, I want to tap-select two or more light tiles in the room and have a "Group these" action appear — instead of opening a modal full of checkboxes that mirror the tiles I'm already looking at.
- As a user wanting to ungroup or rename a light group, I want to do it from the group tile itself (long-press / context action), not by entering edit mode then clicking the group's edit affordance.
- As a user wanting to hide a flaky offline sensor, I want a quick "Hide" action from the tile, with a clear undo path.
- As a user, I want a **single clear primary action** when I tap a tile: a sensor tile shows history, a light tile toggles, a camera tile opens the live stream, a group tile opens the group detail. Secondary actions live in a context menu, not behind an edit-mode reveal.

## Functional Requirements

### One canonical interaction pattern per tile type

- **Tap = primary action** (immediate). Climate / motion / lightlevel tile → open history. Camera tile → open live stream. Light tile → toggle on/off. Light-group tile → open group detail dialog. Already mostly true; this codifies it.
- **Long-press / right-click / dedicated kebab menu = secondary actions** (rename, configure, change room, hide/remove). Replaces the per-tile edit/remove icons that today only appear in edit mode.
- **No global edit mode for the room.** "Edit room" is replaced by per-item entry points (rename room → tap title; set targets → from a climate tile's context menu; group lights → multi-select on tiles; remove room → from the room's three-dot menu).
- The kebab/context menu uses the same Catalyst `Dropdown` chrome that the user menu uses, so the visual language is consistent across the app.

### Inline rename for the room title

- Tap (or click) the room name text → it becomes editable in place. Enter saves; Escape cancels; clicking outside saves.
- No "Edit room" button in the header just for renaming.
- The room's three-dot menu (top-right) only contains room-level actions: "Set targets…", "Group lights…", "Remove room".

### In-place climate target editing

- The climate tile shows a small "Target …" sub-line when a target is set, like today.
- Tap on the target sub-line (or use the tile's context menu → "Set target") to edit just that value, in a small popover or inline editor.
- Removes the per-room "Edit room → target temperature / target humidity sliders + AppSwitch" panel that pops up at the bottom of the card. Targets are per-sensor edits, not a room-edit-mode thing.

### Light grouping by tile multi-select

- Long-press a light tile → enters a "select" mode where the tile shows a checkmark.
- Tapping additional light tiles toggles them in/out of the selection.
- An action bar appears (sticky to the room card or floating at the bottom of the screen) showing "{N} selected" and actions: "Group", "Cancel".
- "Group" prompts for a name (small inline input, not a full modal) and creates the group with the selected lights.
- For an existing group: long-press the group tile → "Edit members" enters the same select mode, with the existing members pre-checked and the rest of the room's lights selectable.
- The current `LightGroupModal` becomes legacy; it can stay as a fallback "rename group / change theme" dialog, but the membership editing moves to the tile-select flow.

### Per-tile context menu

- Every tile has a kebab (⋮) icon in its top-right corner that's always visible (no hover-reveal). On touch, a long-press also opens the same menu.
- Menu contents per tile type:
  - Climate / motion / lightlevel: View history, Rename, Configure (temperature only), Hide / Remove from room.
  - Camera: Open live stream, Rename, Configure stream URL, Hide / Remove from room.
  - Light: Rename, Edit color, Set theme (only when in a group), Add to group / Remove from group, Hide / Remove from room.
  - Light group: Rename group, Set theme, Edit members, Ungroup.
- The menu uses Catalyst `Dropdown` primitives. No bespoke positioned divs.

### Hide vs Remove distinction

- "Remove from room" detaches the sensor from the room (sensor still exists, becomes Unassigned, can be re-added).
- "Hide" adds the sensor to `blocked_sensors` so it doesn't show up in discovery either.
- The two are clearly labeled and visually distinct in the menu (Hide → warning tone, Remove → destructive tone).

### Click-only destructive confirmations

- Destructive actions (Remove room, Ungroup, Hide sensor, Remove sensor) all use the same `<ConfirmDialog>` with consistent copy ("Remove X? This will…").
- Non-destructive actions (Rename, Edit theme, Edit color, Add/Remove from group) commit immediately or via a single Save click; no confirmation dialog.

### Discoverability

- The kebab (⋮) on every tile is the user's stable entry point. Even users who don't know about long-press will find every action via the kebab.
- The room's three-dot menu is the equivalent for room-level actions.
- The dashboard never has hidden affordances that only appear after entering a mode.

## UI / UX

The dashboard's interaction model becomes:

1. **Look at it / tap it.** Every tile responds to a primary tap with the most common action for that tile (history / live stream / toggle / detail).
2. **Want to change it?** Either long-press the tile (touch) or click its kebab (mouse) to see all the actions.
3. **Want to rename a room?** Tap the title. It's editable.
4. **Want to group lights?** Long-press a light tile, multi-select, hit "Group" in the action bar, name it.
5. **Want room-level actions?** Three-dot menu in the room header.

Visually:
- Every tile gets a small kebab (⋮) icon in the top-right corner, always visible (a quiet `text-subtle` ghost button).
- Selection state on tiles uses a check-mark overlay and a subtle accent ring.
- The action bar that appears during multi-select sits at the bottom of the room card (not at the bottom of the screen — keeps the action local to where the selection is happening).
- Inline rename inputs share styling with the page's `Input` primitive (no surprise size changes).

## Data Model

No changes. Every action above maps to an existing API endpoint (rename room, save reference, create / update / delete light group, patch sensor label, block / unblock sensor).

## API

No changes.

## Acceptance Criteria

- [ ] Every tile (`ClimateTile`, `MotionTile`, `CameraTile`, `HueLightTile`, `LightGroupTile`) has an always-visible kebab (⋮) menu in its top-right corner; long-press on touch opens the same menu.
- [ ] Tapping a tile triggers exactly one primary action — same action every time, documented per tile type.
- [ ] The room header has no "Edit room" toggle. Inline-rename the room title by tapping it; room-level actions sit in a header three-dot menu.
- [ ] Setting target temperature / humidity is a per-climate-tile action (via context menu or inline tap), not a room-level edit-mode panel.
- [ ] Creating a light group: long-press a light → multi-select more lights → action bar offers "Group" → inline name prompt → group created. No mass-checkbox modal.
- [ ] Editing an existing group's membership uses the same tile-multi-select flow with members pre-checked.
- [ ] Hide vs Remove actions are visually and verbally distinct in tile menus, both routed through `<ConfirmDialog>`.
- [ ] No interactive affordance is hidden behind a global edit mode; every action is reachable from a stable, always-visible entry point.
- [ ] All modals use Catalyst `Dropdown` for context menus and `Dialog` for confirmations / inline editors — no hand-rolled positioning.
- [ ] Existing Playwright suite still passes (auth, dashboard load, device-API round-trip). Add new specs for: tile-kebab opens menu, inline room rename saves, multi-select grouping creates a group.
- [ ] `npm run build` succeeds.

## Decisions

- **Kebab visibility — always visible.** Discoverability wins. Hidden-on-hover affordances bite touch users (no hover state) and don't help mouse users find an action they haven't used before. Tone it down to a quiet `text-subtle` ghost button so it stays out of the way; that's enough restraint without burying it. (GitHub, Linear, Notion all keep their kebabs always-visible at row scope.)
- **Multi-select scope — one room at a time.** Groups are per-room in the API; selection state is scoped to a single room card. Long-pressing a light in a different room cancels the selection in the first room (or, if simpler, clears the new-room selection start). The plan can pick whichever feels less surprising; both are common patterns.
- **Inline rename empty value — no-op (no save), exit edit.** Mirrors the existing room-rename behavior and the universal pattern in inline-rename UIs: an empty submit reverts to the previous value silently. Don't show a validation error toast for what's clearly an "I changed my mind" gesture.
- **Per-light "Edit color" — keep as a tile-menu action.** Users can already do this via the existing `EditLightModal` (now reachable from the room dashboard); the spec just formalizes the entry point. Lets users override one bulb in a themed group without leaving the dashboard, matches the existing in-group color override flow.
- **Action bar position — sticky-pin to the bottom of the room card** while scrolling that card. The user's selection is bounded to one room (per the previous decision), so the action surface should be local to that room too. A screen-bottom action bar would feel disconnected when working in `xl:grid-cols-3`, where rooms are short and scattered.
- **Long-press timing — 500ms.** Matches iOS / Android system long-press, plus the WAI-ARIA APG default. 300ms is snappier but conflicts with the OS-level long-press for "select text" / "image options" on mobile, which leads to gesture races. Apply consistently across every long-press affordance in the dashboard.
