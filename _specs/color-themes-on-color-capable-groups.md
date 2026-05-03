# Feature Spec: Restrict Color Themes to Color-Capable Light Groups

## Overview

Color themes (`amber`, `emerald`, `rose`, `indigo`, `catppuccin`, `gruvbox`, etc.) only make sense when applied to multiple color-capable bulbs at once: the theme's `bulbPalette` is distributed round-robin across members so each bulb takes a different hex from the palette, producing a coordinated multi-color scene. Showing these themes on a single light, or on a group whose members are all white-only, is misleading — the user picks "Rose" expecting pink lighting and gets nothing, or gets a single bulb taking one color from a palette that was designed for several. This feature restricts the color-theme picker so it only appears on **light groups**, and within that, only on groups whose members include at least one color-capable bulb. Single lights and white-only groups continue to see the new white presets (Warm, Everyday, Reading, Nightlight) only.

## Goals

- Hide color themes from contexts where they cannot produce their intended visual effect: single-light controls, and light groups with no color-capable members.
- Keep the white presets universally available, since they work on any bulb capability tier (color, color-temperature, brightness-only).
- Make the picker reflect the actual capabilities of what's being controlled, so users don't pick a theme and silently get nothing.

## Non-Goals

- Removing any color themes from the catalog. The themes still exist; they are just not offered everywhere.
- A bulk database migration script. Coercion happens on the first read of an affected row (see Persisted-state handling); no separate migration step is needed.
- Re-categorising what "color-capable" means at the bulb level — this feature uses whatever capability signal the existing code already uses to decide whether a bulb accepts color commands.
- Changing the white presets, the theme catalog data shape, or any wire format.
- Hiding the color section in some intermediate state (e.g. greyed-out but visible). The section is either present or absent.

## User Stories

- As a user controlling a single light, I want the theme picker to only show me presets that will actually do something on this bulb, so that I'm not offered a multi-bulb color palette I can't use.
- As a user controlling a light group whose members are all white-only bulbs, I want the picker to only show me white presets, so that I don't pick "Emerald" and watch nothing change.
- As a user controlling a light group with at least one color-capable bulb, I want both the white presets and the full color theme catalog, so that I can use the multi-color scenes the way they were intended.
- As a user, I want this rule to update live as I add or remove members from a group, so that the picker stays accurate when the group's mixed capabilities change.

## Functional Requirements

### Picker visibility — single lights

- The single-light theme picker (anywhere a single light is being configured / controlled, not as part of a group) shows only the **Whites** section. The **Colors** section is hidden entirely — no header, no swatches.
- The Whites section continues to render exactly as it does today.

### Picker visibility — light groups

- A light group's theme picker shows the **Whites** section unconditionally.
- The **Colors** section is shown only if the group has **at least one member that is color-capable**. If every member is white-only (color-temperature only or brightness-only), the Colors section is hidden — same way as the single-light case.
- The decision is made per group, on the current member list of that group at render time.

### Determining "color-capable"

- A member counts as color-capable using the same signal the existing code already uses to decide whether to write color values to that bulb (i.e. the capability data already stored alongside each Hue device, and whatever equivalent exists for non-Hue lights).
- Color-temperature-only bulbs (e.g. Hue White Ambiance) do **not** count as color-capable for the purposes of this rule, because color themes use full RGB hex palettes, not CCT values.
- Brightness-only bulbs do not count.
- A group with mixed capability — e.g. one color bulb plus several white-only bulbs — is treated as color-capable. The Colors section is shown. (The fan-out already handles per-member capability fallback today, so the white-only members simply ignore color commands; this is unchanged.)

### Reactivity

- If the group's member list changes (a member is added, removed, or the bridge re-syncs and a member's capabilities change), the picker visibility must update on the next render of the picker without the user manually refreshing.

### Persisted-state handling

- An existing single light or white-only group whose `theme_key` points to a color theme that this feature no longer offers (i.e. any color theme on a single light, or any color theme on a group with no color-capable members) is **coerced to `everyday`** on the first read of that row after this feature ships.
- Coercion is one-shot: the row is rewritten in place during that read, and subsequent reads return the new value directly.
- A color theme persisted on a group that *does* qualify (group with at least one color-capable member) is left untouched — that context still offers color themes from the picker.
- No separate database migration step runs at startup; coercion happens organically as rows are read.

### Validation and API

- API endpoints continue to accept any theme key as before — there is no new server-side rejection for "color theme on a single light" or "color theme on a white-only group". This rule is a UI affordance, not a contract change.

## UI / UX

- **Single-light controls.** The theme picker shows only the Whites section. There is no Colors header, no swatches, and no empty placeholder.
- **Light group with no color-capable members.** Same behaviour as a single light — Whites only, Colors section omitted.
- **Light group with at least one color-capable member.** Whites section first, Colors section second — same layout as today.
- **Empty state.** When the Colors section is hidden, the picker should not feel truncated. The Whites section is the picker; no placeholder, no "color themes hidden" disclaimer.
- **Live behaviour.** Adding the first color-capable bulb to a previously white-only group makes the Colors section appear the next time the picker is opened. Removing the last color-capable bulb from a group hides it again.

## Data Model

- No new tables, no new columns, no schema changes.
- No migration of existing `theme_key` values on `light_groups` or per-light state.

## API

- No new endpoints.
- No changes to request or response shapes.
- No new server-side validation. The restriction is UI-only.

## Acceptance Criteria

- [ ] Opening the theme picker for a single light shows only the Whites section; no Colors header or swatches are rendered.
- [ ] Opening the theme picker for a light group whose members are all white-only (color-temperature-only or brightness-only) shows only the Whites section.
- [ ] Opening the theme picker for a light group with at least one color-capable member shows both the Whites and Colors sections, with Whites first.
- [ ] Color-temperature-only bulbs (e.g. White Ambiance) on their own do **not** cause the Colors section to appear.
- [ ] Adding a color-capable member to a previously white-only group causes the Colors section to appear on the next picker open, without a manual refresh.
- [ ] Removing the last color-capable member from a mixed group causes the Colors section to disappear on the next picker open.
- [ ] An existing single light or white-only group that has a color `theme_key` persisted is coerced to `everyday` on the next read; the tile chrome reflects the coerced value, and subsequent reads return `everyday` directly.
- [ ] A color theme persisted on a group that *does* have at least one color-capable member is left untouched after this feature ships.
- [ ] No regression in the existing color-themes behaviour on color-capable groups.
- [ ] No new server-side validation rejects existing API calls.

## Open Questions

_All open questions resolved; see Resolved Decisions._

## Resolved Decisions

- **An open picker stays as it was at open time; it does not hot-swap or auto-close when a background sync changes member capabilities. The next time the user opens the picker, the next render reflects current capabilities.** Best-practice UX: hot-swapping yanks options out from under a user who may already be moving toward one (or surfaces a "Colors" section the user wasn't expecting and didn't ask for); auto-closing destroys the user's in-progress interaction. Pickers are short-lived (open for a few seconds at a time), so the window in which a sync could land is small, and the cost of being wrong for that window is bounded — the user simply sees the same options they would have seen a moment ago. This matches how most native pickers (macOS color, IDE autocomplete, messenger reaction pickers) behave: they snapshot at open time and refresh on next open. It also keeps the implementation trivial — the existing "next render of the picker" requirement is sufficient; no separate observation channel is needed.
- **"Single light" covers every control surface that targets exactly one bulb: per-tile single-light controls, the lights-list quick-pick, and any room-card single-light affordance. The room-card master switch is excluded — it is a group control and follows the group rules.** All single-light surfaces hide the Colors section unconditionally; only group surfaces gate visibility on member capabilities.
- **"Color-capable" is determined by the per-member capability JSON already stored on each Hue device (`hue_devices.capabilities.color === true`). When the signal is missing or ambiguous, hide the Colors section.** This is the same signal `fanOutLightCommand` already uses to decide whether to write color values to a bulb, so the picker visibility tracks reality 1:1. Members whose `capabilities` JSON is null, unparseable, or missing the `color` flag are treated as not-color-capable. Rationale for hiding on ambiguity: showing the Colors section and then having the apply silently no-op is exactly the failure mode this feature was created to prevent. Once capabilities sync, the picker reactively updates per the live-behaviour requirement above.
- **Legacy color-theme values are coerced to a sensible white preset (Everyday) on the first read after this feature ships.** When a single light or a white-only group has a persisted color `theme_key` (e.g. `rose`, `emerald`) that this feature would no longer offer, that value is replaced with `everyday` on the first read of the affected row. Coercion is one-shot — the row is rewritten in place and subsequent reads return the new value. Option (a) (leave untouched) was the least-surprising choice in the abstract but produces a confusing tile chrome that the user can no longer reach via the picker. Option (b) is cleaner and aligns the persisted state with what the picker can actually offer. Option (c) (lazy coercion on picker touch) leaves the database inconsistent for an unbounded period and was rejected.
- **Restriction is UI-only; the API continues to accept any theme key on any context.** Server-side enforcement was rejected for two reasons: (1) the existing fan-out path already handles "color theme on a white-only bulb" gracefully via per-member capability fallbacks, so an API-level reject would only catch UI-bypass cases that don't actually break anything; (2) keeping the rule in the UI lets us evolve the affordance without a coordinated API/UI rollout. If external clients abuse this in the future, server-side validation can be layered on without breaking changes.
