# Feature Spec: Color Theme for Light Groups

## Overview

Light groups on the dashboard currently share one visual treatment: the same tile background, the same blue accent for "on", the same purple border for "mixed", the same triple-bulb stadium toggle. With more than two or three groups in a single room — or across many rooms — they all blur together visually, and a user has to read each label to find the one they want. This feature lets the user assign a color theme to each light group so they can be told apart at a glance, by color rather than by label.

A "color theme" here is a visual identity for the group as it appears on the dashboard — accent color, glow tint, possibly the toggle bulb color when on. It is **not** a control that sets the color of the bulbs themselves.

## Goals

- Let users assign a color theme to a light group so the group's tile can be recognized by color alone.
- Provide a small, curated palette of themes that look good against the dark dashboard and remain visually distinct from each other (no near-duplicates, no themes that disappear against the card background).
- Persist the theme choice so it survives reloads, dashboard reopens, and Hue bridge resyncs.
- Reflect the theme consistently in the group's resting visual identity (when "all off"), the "on" state, and the "mixed" state — without losing the existing semantic distinction between those states.
- Default sensibly: groups created before the feature, or new groups that skip the picker, get a neutral default theme.

## Non-Goals

- Changing the actual color of Hue bulbs (color temperature or RGB). The bulbs themselves are not touched by this feature.
- Theming individual lights, rooms, sensors, cameras, or any tile other than the light group tile.
- Free-form color picker, hex input, or unlimited custom colors — only a curated palette.
- Theming the room master toggle, the global master toggle, or the dashboard chrome.
- Light/dark mode for the dashboard as a whole (the dashboard remains dark-themed; themes here are accent colors that work against the dark surface).
- Reordering groups, renaming-by-color, or sorting by theme.

## User Stories

- As a user with three light groups in the living room (e.g. "Reading nook", "Couch", "Dining"), I want each group's tile to use a distinct color, so that I can find the one I want without reading the labels.
- As a user creating a new light group, I want to pick a color theme as part of the create flow, so that the group is visually identifiable from the moment it appears on the dashboard.
- As a user editing an existing group, I want to change the color theme later, so I can recolor groups after the room layout settles.
- As a user who doesn't care about colors, I want sensible defaults, so I can keep ignoring the feature and the dashboard still looks coherent.

## Functional Requirements

### Theme Catalog

- A small, predefined palette of color themes (target: 6–8) is offered to the user. Each theme has a stable identifier (e.g., a key like `slate`, `amber`, `emerald`) used in storage, a human-readable label shown in the picker, and a set of color values used when rendering the tile.
- Themes must be visually distinct from each other against the dark dashboard surface; no two themes should be confusable at a glance.
- One theme is designated as the **default** and is applied to any group without an explicit choice.

### Assigning a Theme

- The light group create flow exposes a theme picker, with the default theme pre-selected.
- The light group edit flow exposes the same theme picker, pre-selected to the group's current theme.
- The picker shows each theme as a small swatch, with the selected swatch clearly indicated (selection ring, fill, or check).
- Saving the group persists the theme choice along with the existing group fields (name, members, etc.).
- Cancelling the create or edit flow does not change the persisted theme.

### Rendering a Theme on the Group Tile

- The theme drives the visual identity of the group tile in three states:
  - **All off** — a subtle theme tint on the tile (e.g., border, faint background wash, or accent on the toggle's bulb stack) so the group is recognizable even when its lights are off.
  - **All on** — a stronger theme treatment: the toggle's "on" glow uses the theme color (replacing the current fixed blue glow), and the on-state border / on-state background gradient pick up the theme color.
  - **Mixed** — the existing "mixed" indication (e.g., purple-tinted border) is preserved, but it must remain distinguishable from the theme color. If a theme would clash with the mixed cue, the mixed cue takes precedence visually.
- The group's name, status text, and member count text remain readable in all theme combinations (no theme should produce illegible text).
- The triple-bulb icon's "on" coloring (the brightening of the side bulbs when the group is on) follows the theme.
- Offline / unreachable badges, "× failed" badges, and error indicators retain their existing red/amber semantic colors regardless of theme.

### Defaults and Migration

- Existing groups created before this feature was introduced display the **default** theme until the user edits them and picks something else.
- A group with a `null` or unrecognized stored theme key falls back to the default theme.
- Removing a group does not affect any other group's theme.

### Single Light Tiles

- Individual `HueLightTile`s are **not** themed in this feature. They keep their current blue accent. Themes apply only at the group level.

## UI / UX

The picker is the only new UI surface; everything else is a styling change to the existing group tile.

- **Theme picker** — appears in the existing `LightGroupModal` (the create / edit dialog), placed below the group name input. Renders as a row of small (~24–28 px) circular swatches, one per theme, with the theme's color as the swatch fill. The currently selected swatch shows a clear selection state (e.g., a ring or check). Hover / focus states for keyboard accessibility. Wrapping is acceptable when there are more themes than fit on one row.
- **Group tile** — visual change only; structure is unchanged. Theme color drives:
  - the border accent in the "off" state (currently the same `#2a2f45` for all groups),
  - the "on" state border and background gradient (currently fixed blue),
  - the toggle button's "on" glow color (currently `rgba(160, 196, 255, 0.35)`),
  - the side-bulb opacity / tint when on (currently a fixed brightening).
- **Mixed state** — keep the current purple ring; if a theme is itself purple-ish, the mixed ring is rendered in a way that still reads as "mixed" (e.g., a stripe or pattern, or a fixed alternative color).
- **Picker affordance label** — a short label like "Color" above the swatch row, no help text needed.
- **Picker absence** — if the user is not in the create/edit modal, no UI for theming exists; the theme is set only at create time or via "edit group".

## Data Model

- `light_groups` (or whatever the existing groups table is called) gains a new column for the theme: a short string holding the theme key (e.g., `'amber'`). Nullable, with `NULL` interpreted as "default".
- `LightGroupView` (the API shape consumed by the dashboard) gains a new field exposing the resolved theme key. The server resolves `NULL` / unrecognized keys to the default key before sending, so the client never needs fallback logic.
- The theme catalog itself (key → label → color values) lives in the client, not the database. The database stores only the key.
- No changes to `sensors`, `rooms`, `sensor_readings`, or any other table.

## API

- `POST /api/rooms/:id/light-groups` — accepts an optional `theme` field in the request body. If omitted, the server stores `NULL` (default).
- `PATCH /api/light-groups/:id` — accepts an optional `theme` field; updating it changes only the theme without touching members or name.
- `GET /api/rooms` (or whichever endpoint returns rooms with their groups) — the returned `LightGroupView` payloads now include the resolved theme key.
- `DELETE /api/light-groups/:id` — unchanged.
- Validation: server rejects unknown theme keys with a 400 (or coerces them to default — decision to be made during implementation).

## Acceptance Criteria

- [ ] Creating a new light group shows a theme picker; the default theme is pre-selected; saving the group persists the chosen theme.
- [ ] Editing an existing light group shows the picker pre-selected to the group's current theme; changing and saving updates only the theme without disturbing members or name.
- [ ] Cancelling the create or edit dialog leaves the persisted theme unchanged.
- [ ] Six to eight visually distinct themes are available; no two are easily confusable; all remain readable against the dark dashboard.
- [ ] The group tile reflects the theme in the "all off", "all on", and "mixed" states, with the existing semantic cues (mixed indicator, offline badges, error indicators) still legible.
- [ ] Existing groups (created before the feature) render with the default theme until the user edits them.
- [ ] The default theme is applied when the stored theme is `NULL` or unrecognized.
- [ ] The theme persists across page reloads, browser restarts, and Hue bridge syncs.
- [ ] Single-light (`HueLightTile`) appearance is unchanged.

## Open Questions

- Which six to eight colors should make up the curated palette? Suggested directions: warm (amber, terracotta), cool (slate, teal, indigo), nature (emerald, moss), accent (rose, plum) — but the final palette is a design decision.
- Is the theme picker a row of swatches, a swatch + dropdown, or something else? (Default to swatches unless picker grows.)
- Should the "mixed" ring stay purple universally, or shift to a contrasting per-theme color when the theme itself is purple-ish?
- Should the theme drive the group tile's resting *background* (subtle wash) or only the *border / accent*? Background washes can look heavy on dense rooms; borders can look subtle on small tiles.
- Should the global master toggle pill or the per-room master toggle pick up any theme cues (e.g., a multi-color hint when groups beneath it have varied themes)? Probably no, but worth confirming.
- Should the theme name appear anywhere on the tile (small label) or stay implicit (color only)?
- Validation policy for unknown theme keys: 400 reject, or silent coerce-to-default? Reject is stricter; coerce is more forgiving for older clients.
