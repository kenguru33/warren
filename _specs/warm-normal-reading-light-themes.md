# Feature Spec: Warm, Everyday, Reading and Nightlight Light Themes

## Overview

The light-theme catalog today is a set of *color* palettes — `slate`, `amber`, `emerald`, `catppuccin`, `gruvbox`, etc. — that map to per-bulb hex colors and a matching tile chrome. Users have asked for the more practical, everyday case: setting bulbs to a *quality of white light* rather than a hue. This feature adds four white-balance presets — **Warm Light**, **Everyday**, **Reading Light**, and **Nightlight** — to the existing theme picker so a room or light group can be set to a comfortable everyday white with a single tap.

## Goals

- Let the user apply "warm white", "neutral white", or "cool/bright reading white" to any single light or light group from the same theme picker that already exists.
- Make the new presets first-class members of the theme catalog so they roundtrip through every code path that handles a theme key today (per-light state, light groups, master switch, persisted state, tile chrome).
- Make the visual representation of the four presets read clearly as *white* with different temperatures (Nightlight additionally as dim), not as another color hue, so users can distinguish them at a glance from the existing color themes.

## Non-Goals

- Changing the data model for `light_groups.theme_key` or the wire format of `POST /api/integrations/hue/lights/{deviceId}/state` — the new presets ride on the existing `theme` field as additional valid values.
- Adding a free-form color-temperature slider. This feature is opinionated presets only.
- A free-form / continuously-tunable brightness control as part of the preset UI. Each white preset pins one specific brightness; users still adjust brightness freely via the existing per-light slider after the fact, but the preset itself does not expose a separate brightness control.
- Migrating existing groups whose `theme_key` is already set to a color theme.
- Exposing the presets to non-color-capable / non-color-temperature-capable bulbs in any new way — they will be handled the same way the existing themes already handle capability fallbacks.

## User Stories

- As a user, I want to set my living-room lights to a warm white in the evening, so that the room feels relaxing without me having to pick an exact color.
- As a user, I want to switch the same lights to a brighter, cooler white when I sit down to read, so that I can see the page comfortably without rummaging through individual bulbs.
- As a user, I want an "everyday" default white preset, so that I have a sensible default that isn't tinted warm or cool.
- As a user, I want the four new white presets to be visually distinct from the colored themes in the picker, so that I don't confuse "Warm Light" with "Amber".
- As a user, I want a Nightlight preset that goes dim and warm with one tap, so that I can navigate the room at night without blasting the lights at full brightness.
- As a user, when I pick a preset and refresh the dashboard, I want the same preset to still be selected and the bulbs to still be in that state.

## Functional Requirements

### Theme catalog

- Add four new entries to the canonical theme list, ordered before the existing color themes in the picker so they read as the "default / utility" choices: **Warm Light**, **Everyday**, **Reading Light**, **Nightlight**.
- Each preset has:
  - A stable theme key (machine identifier) used in storage and on the wire.
  - A human-readable label.
  - A swatch shown in the picker.
  - A definition of the *bulb output* — i.e. what the lights actually do when the preset is applied. For color-capable bulbs this is a white at the relevant color temperature; **every preset additionally specifies a target brightness percentage**.
- The white-point + brightness targets are:
  - **Warm Light** — warm white, **60%** brightness (relaxing candlelight feel).
  - **Everyday** — neutral white, **100%** brightness (default everyday).
  - **Reading Light** — cooler / brighter white, **100%** brightness (suitable for reading).
  - **Nightlight** — very warm white, **10%** brightness (low enough to navigate a dark room without being disruptive).
- Exact white-point CCT values are an implementation choice but must be documented in the same place the existing themes are defined.

### Tile chrome and picker UI

- The four new presets must render correctly in every place the existing themes render: theme picker, tile borders/glow when on, tile background when on, off-state border, mixed-state ring (where the group has heterogeneous lights).
- Visually, the four presets must read as *white light at different temperatures*, not as additional color palettes. The chrome (border, glow, gradient, bulb-icon tint) for each preset should reflect its temperature: warm presets should look warm, cool presets should look cool, neutral should look neutral. Nightlight additionally reads as *dim* — its tile chrome conveys low intensity (e.g. softer glow, dimmer gradient) so the user understands it is not a normal-brightness setting.
- The picker groups the two categories under section headers — **Whites** (the four new presets) and **Colors** (the existing color themes) — with **Whites** listed first. The headers are small, subdued labels (not tabs) so both groups remain visible at the same time and users learn the distinction at a glance.

### Apply behavior — single light

- Selecting a white preset for an individual light must drive that light to the corresponding white point *and* the corresponding target brightness on the actual hardware where the bulb supports them.
- For color-capable or color-temperature-capable bulbs that also support brightness (the common case): both the white point and the brightness target are written.
- For bulbs that support brightness only (no color, no color-temperature): only the brightness target is written; the persisted theme key and tile chrome update to reflect the chosen preset.
- For bulbs that support color or color-temperature but not brightness (rare): only the white point is written; brightness writes are skipped silently, the same way the existing capability fallbacks work today.

### Apply behavior — light group

- Selecting a white preset for a light group applies that white point *and* brightness target to every member that supports them, in parallel, using the same fan-out path the existing color themes use. Per-member capability fallbacks match the single-light rules above.
- The success / partial-failure reporting (`{ successCount, failureCount, total }`) is unchanged.

### Persistence and round-trip

- The chosen preset key must persist exactly as the existing color themes do today: per-light state and per-group state survive a page reload and a server restart.
- The poller that syncs Hue state on a 10-second interval must not overwrite or downgrade a chosen preset back to a color theme on the next sync cycle.

### Validation

- The four new keys must be accepted everywhere a theme key is accepted today (per-light state endpoint, group state endpoint, master-state endpoint, tile rendering).
- An unknown theme key continues to be a hard error in the picker, as it is today — adding the four presets must not loosen this validation.

## UI / UX

- **Theme picker.** The existing theme picker (in single-light controls and the light-group editor) gains four new entries listed under a **Whites** section header at the top, with the existing color themes following under a **Colors** section header. Their swatches read as white-with-temperature, not as a color hue. The Nightlight swatch additionally conveys low intensity.
- **Tile chrome when on.** A tile set to a white preset has a subtly tinted glow and gradient that conveys the temperature (warm = amber-ish, neutral = neutral, reading = cool blue-white, nightlight = warm + dim) but is clearly *white-dominant* rather than a saturated color.
- **Bulb icon tint.** The bulb icon on the tile reflects the temperature of the preset.
- **Mixed state.** A light group whose members have different states still uses the existing mixed-state ring; if mixed-state needs a per-preset override (`mixedRingOverride`), that is permitted and follows the existing convention.
- **Light vs dark UI mode.** The four presets must look correct in both light and dark UI modes, following the existing `light` variant pattern in the theme definitions.

## Data Model

- No new tables and no new columns. The four new theme keys extend the existing `LightThemeKey` union and the `LIGHT_THEMES` catalog in the shared theme module.
- The `light_groups.theme_key` column already stores theme keys as strings; the four new keys are valid values for it from this feature forward.
- No migration is required for existing rows.

## API

- No new endpoints.
- The following endpoints accept the four new keys in their `theme` field as valid input, with the same shape as before:
  - `POST /api/integrations/hue/lights/{deviceId}/state`
  - The light-group state endpoint
  - The master-state endpoint
- Response shapes are unchanged.

## Acceptance Criteria

- [ ] **Warm Light**, **Everyday**, **Reading Light**, and **Nightlight** appear in the theme picker under a **Whites** section header, with the existing color themes following under a **Colors** section header.
- [ ] Each preset is visually distinguishable from the others *and* from the existing color themes.
- [ ] Selecting **Warm Light** drives a color-capable Hue bulb to a clearly warm white *and* writes the catalog-defined brightness for that preset.
- [ ] Selecting **Everyday** drives the same bulb to a neutral white *and* writes the catalog-defined brightness for that preset.
- [ ] Selecting **Reading Light** drives the same bulb to a cooler / brighter white suitable for reading *and* writes the catalog-defined brightness for that preset.
- [ ] Selecting **Nightlight** drives the same bulb to a very warm white *and* writes the catalog-defined low-brightness target.
- [ ] Applying a preset to a light group fans out the white point + brightness to every capable member, with parallel dispatch and the existing partial-failure reporting.
- [ ] The chosen preset persists across a page reload and a server restart.
- [ ] The 10-second Hue poller does not overwrite a freshly-applied preset.
- [ ] Tile chrome (border, glow, gradient, bulb icon) renders correctly for all four presets in both dark mode and light mode. Nightlight reads as visibly dim relative to the other three.
- [ ] Mixed-state ring renders correctly when a group with one of the new presets has heterogeneous member state.
- [ ] No existing color theme regresses visually or behaviorally.
- [ ] An unknown theme key is still rejected by the picker (no loosening of validation).
- [ ] Bulbs that support only brightness (no color, no color-temperature) accept a preset selection without erroring; the brightness target is written, and the persisted theme key + tile chrome reflect the choice.
- [ ] Bulbs that support color or color-temperature but not brightness (rare) accept a preset selection without erroring; the white point is written, the brightness write is skipped, and the persisted theme key + tile chrome reflect the choice.

## Open Questions

_All open questions resolved; see Resolved Decisions._

## Resolved Decisions

- **Picker uses subdued section headers ("Whites" / "Colors") rather than tabs or just ordering.** Headers name what's in each group (the actual user need: "which ones change color, which ones change temperature?"), keep both groups visible simultaneously (unlike tabs), and match the established pattern in macOS / iOS settings, Figma's color picker, and most design-tool palettes. Tabs would be too heavy for 4 + 13 items.
- **Brightness targets per preset: Warm = 60%, Everyday = 100%, Reading = 100%, Nightlight = 10%.** Each value matches the category the preset is named for (relax / default / read / dim navigation). Tweaks during implementation review are allowed but the four values are the starting point.
- **Default-white preset is named "Everyday" rather than "Normal Light".** "Normal" was functional but bland. "Everyday" sits well alongside Nightlight (both use-case-based labels), conveys the default-use role, and avoids the temperature claim that "Daylight" would make (which would compete with Reading Light's territory) or the technical sound of "Neutral".
- **Every white preset pins both a white point and a target brightness.** Each of Warm Light, Everyday, Reading Light and Nightlight defines its full lighting "scene" — temperature and intensity together — and both are written on apply. This is a deliberate departure from the existing color themes (which never touch brightness), motivated by the fact that "warm relax", "everyday neutral", "bright reading" and "very dim warm" are inherently brightness statements as much as temperature statements. Users still adjust brightness freely via the existing per-light slider after the preset has been applied.
- **Tile chrome communicates color-temperature-only bulbs versus full-color bulbs.** Color-temperature-only bulbs (e.g. Hue White Ambiance) get a visual cue on the tile that distinguishes them from full-color bulbs, so the user understands at a glance which bulbs can render the colored themes and which can only render the white presets. Exact treatment (icon variant, dimmed color-theme swatches in that tile's picker, or a small badge) is deferred to implementation review.
- **Ship Nightlight in this same change rather than a follow-up.** Hue's stock recipes include it, users discovering the white-preset category will reasonably expect it, and shipping it later would mean a second pass over the same catalog/picker/chrome touch-points.
