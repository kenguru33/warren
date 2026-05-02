# Feature Spec: Fix Visual Blunders

## Overview

The dashboard works end-to-end but has accumulated a number of small visual rough edges during the migration and the iterative tweaks that followed: toggle switches that aren't aligned with their labels or that show inconsistent on/off colors, status badges that don't track the active color scheme, custom color choices in `globals.css` that escape the semantic-token system, and miscellaneous spacing/alignment glitches across tiles and modals. This spec is a focused pass to catalog and clean up those issues so the UI feels intentional and consistent across the six color schemes and dark/light modes.

## Goals

- Catalog and fix every misplaced or misaligned switch in the app (room master toggle, light-group master, per-tile light toggle, target-temp/humidity enables, "show only unused" filter, etc.) so they sit on a consistent baseline with their labels.
- Make every switch follow the active color scheme: when on, the track uses the scheme's `accent` token, not a hardcoded indigo/blue/etc.
- Audit hardcoded color usages (hex literals, `bg-zinc-900`, `bg-blue-500`, `text-red-700`, etc.) in domain components and replace them with the semantic tokens (`bg-accent`, `text-error`, `bg-surface-2`, `ring-default`, …) wherever the meaning is semantic. Keep hardcoded palette colors only where they're genuinely arbitrary visuals (e.g. the rainbow conic gradient on the custom-color picker, the stone-900 of the `btn-primary` background — but reconsider whether those should also become tokens).
- Fix the alignment, spacing, and visual rhythm issues that crept in during the Catalyst port: tile contents that don't share a baseline, modals that don't match each other's padding, badges that sit at different heights inside their rows.
- Make sure every interactive element has visible focus and disabled states that match the active scheme.
- Result: the dashboard should feel polished — switching color schemes should produce a cohesive look, not random pockets of indigo or zinc that didn't get the memo.

## Non-Goals

- No new features, no new pages, no new tile types, no new modals.
- No data-model or API changes.
- Not a redesign — pages and tiles keep their structure; only the visual details change.
- Not a sweep through Catalyst's primitives in `app/components/` (those are framework-provided and have their own styling). Stay focused on the Warren-specific code under `app/components/warren/` and the domain pages.
- Not adding light/dark theme variants beyond what already exists.
- Not changing the six color-scheme presets themselves.

## User Stories

- As a user with the `gray-rose` color scheme active, I want the room master switch to glow rose when on (not indigo), so the scheme actually applies everywhere.
- As a user editing a room, I want the "Enable target temperature" switch to sit on the same baseline as its label rather than floating above or below it.
- As a user toggling the "Show only unused" filter on the Sensors page, I want the switch and its label to look like they belong together — same vertical alignment, consistent gap.
- As a user who picks a non-default theme, I want every status badge (Connected, Unreachable, Mixed, Hue, Unassigned, Pending, Synced) to use the scheme's color tokens consistently — not a hardcoded green or amber.
- As a developer, I want to grep `app/components/warren/` for hex codes and Tailwind palette classes (e.g. `bg-zinc-`, `text-blue-`, `ring-red-`) and find none that aren't intentional escape hatches, so the tokens are the source of truth.

## Functional Requirements

### Switch placement and alignment

- Every `<AppSwitch>` (and any inline raw switch markup remaining) sits on the **vertical baseline** of its associated label, with consistent vertical spacing in its container.
- Switches in form rows (room edit panel target-temp/humidity, sensors-page "Unused only", lights-page "Unused only") align label-on-the-left, switch-on-the-right with `flex items-center justify-between`. The switch's `align-middle` is correct relative to the label's font size.
- Switches inside table-like rows (per-light row in `LightGroupDetailRow`, per-row toggle on `/lights`) have consistent column widths so multiple rows visually line up.
- The shared `AppSwitch` component is the single rendering path for all switches in `app/components/warren/`. Any place that hand-rolls switch markup gets replaced with `<AppSwitch>`.

### Switch color tracking

- The "on" track of every switch uses the scheme's `bg-accent` token, with a slightly stronger accent ring and the same disabled/pending opacity treatment.
- The "off" track uses a neutral `bg-strong/40` (light) or `bg-white/5` (dark) consistent with the existing token variables; verify it reads the same regardless of scheme.
- The thumb stays white-on-track for contrast in both modes.
- Verify the look across all six schemes (`zinc-indigo`, `slate-sky`, `stone-amber`, `neutral-emerald`, `gray-rose`, `zinc-violet`) and both light/dark — no scheme should produce a switch that doesn't match the rest of the chrome.

### Hardcoded color audit

- Grep `app/components/warren/` and the domain pages for:
  - Hex color literals (`#[0-9a-fA-F]{3,8}`).
  - Tailwind palette utilities for non-neutral colors (`bg-{red,orange,amber,yellow,lime,green,emerald,teal,cyan,sky,blue,indigo,violet,purple,fuchsia,pink,rose}-…`, same for `text-`, `ring-`, `border-`, `outline-`).
  - Replace each occurrence with the semantic equivalent (`bg-error`, `text-success`, `ring-accent`, etc.) unless it's documented as an intentional escape hatch (the `LightColorPicker` rainbow gradient, the bulb-palette hexes from `light-themes.ts`, the heater-orange / fan-sky glyph colors on `ClimateTile` which are genuinely indicator-specific).
- The `bg-zinc-900 dark:bg-white` color of the user-icon badge in the sidebar/top-bar: assess whether it should be a token (`bg-accent`?) or stay neutral. Document the decision in the file's comment.

### Badge consistency

- Every `badge-{success,warning,error,accent,neutral}` instance reads the same: same padding, same font size, same line height, same ring/background per state.
- Status meanings line up: `success` = good (Connected, On), `warning` = transient/attention (Mixed, Pending sync, Hue), `error` = broken (Unreachable, Offline, Unauthorized), `neutral` = informational (Unassigned, model name, count).
- Badges sit on the same vertical baseline as their adjacent text. No badge is taller or shorter than its row.

### Tile + modal spacing

- All tiles in `app/components/warren/` use the same outer padding (`px-4 py-4` or `px-5 py-5` — pick one and apply).
- All modals use the same header (`px-6 pt-5 pb-4 border-b`), body padding (`px-6 py-5`), and footer (`px-6 py-4 border-t bg-surface-2/50`).
- The "edit room" inline rename input matches the page Heading's font size (no jarring jump in size between view and edit modes).
- Sliders (`.slider`, `.slider-sm`) have consistent track/thumb dimensions across `ClimateTile` target sliders, `HueLightTile` brightness, `LightGroupTile` brightness, and `/lights` per-row brightness.

### Focus and disabled states

- Every interactive element (button, link, switch, slider, listbox, dropdown trigger) has a visible `focus-visible` ring keyed off `--color-accent`. No element relies solely on browser defaults.
- Every disabled state uses `opacity-50 cursor-not-allowed` consistently. The current `pending` state on group/light tiles uses opacity-50 — verify it matches.
- Hover states match the focus token family. No hover that uses a different color than the corresponding focus.

### Spacing rhythm

- Page-level padding (`p-6` desktop, `p-10` lg) is consistent across all four pages (`/`, `/sensors`, `/lights`, `/integrations/hue`).
- Section gaps inside tiles (`gap-3` or `gap-2.5`) are consistent across tile types.
- Form fields (`label` → `input`, `label` → switch, `label` → slider) share a consistent vertical rhythm.

## UI / UX

No new UI is introduced. Every change is a polish on existing layout: switches move to the right baseline, colors swap to semantic tokens, badges line up, sliders match each other. The user should notice "everything looks intentional" rather than any specific change — and the experience should be the same across all six color schemes.

## Data Model

No changes.

## API

No changes.

## Acceptance Criteria

- [ ] All switches in `app/components/warren/` and the four dashboard pages render through `<AppSwitch>` and align on the same baseline as their labels.
- [ ] Each switch's "on" state uses `bg-accent` (the scheme token) — verified by switching color schemes and confirming the switch follows.
- [ ] `grep -rE "(#[0-9a-fA-F]{3,8}|bg-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-)" nextjs-ui/app/components/warren/ nextjs-ui/app/(dashboard)/` returns only documented escape hatches (LightColorPicker rainbow gradient, light-themes palette hexes, climate heater/fan glyph colors) — every other match is replaced with semantic tokens.
- [ ] All status badges (`badge-success`, `badge-warning`, `badge-error`, `badge-accent`, `badge-neutral`) render with consistent padding and align on row baselines.
- [ ] Every modal in `app/components/warren/` uses the same header / body / footer padding pattern.
- [ ] Every interactive element has a visible focus-visible ring tied to `--color-accent`.
- [ ] Walk-through verification: switch color scheme to each of the six presets and visually confirm the dashboard looks cohesive, no leftover indigo/blue/zinc-that-shouldn't-be-there.
- [ ] Walk-through verification: toggle dark/light mode and confirm everything still reads correctly in both.
- [ ] Existing Playwright suite still passes (auth, dashboard, device-API, light-group UI flow, Hue setup UI flow).
- [ ] `npm run build` succeeds.

## Decisions

- **User-icon badge — keep neutral** (`bg-zinc-900 dark:bg-white`). Common practice across GitHub / Linear / Notion / etc. is to reserve accent colors for action and state, and use a neutral surface for avatars and identity chrome. Accent on the avatar would compete with the active sidebar item's accent indicator. Keep neutral and add a code comment explaining the rationale.
- **`btn-primary` is already gone** — Phase 11 of the Catalyst migration deleted it from `globals.css`; primary CTAs now go through Catalyst's `Button` (default `color="dark/zinc"`). That treatment is also a neutral primary by design — the same convention Catalyst itself ships, so we inherit the choice rather than make one. No further work for this question.
- **`LightColorPicker` rainbow conic gradient** — intentional non-token escape hatch (it's a literal rainbow signaling "pick any color"). Add a `/* … intentional rainbow … */` comment above the gradient class so future audits don't flag it.
- **`ClimateTile` heater-orange / fan-sky glyph colors — keep fixed**. They encode physical meaning (heat is universally orange/red, cooling is universally blue/cyan) that's independent of the app scheme. Recoloring per scheme would lose that semantic. Add a code comment so the audit doesn't flag the `text-orange-500` / `text-sky-400` literals.
