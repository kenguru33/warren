# Feature Spec: Make UI More Tailwind Plus + Catalyst Like

## Overview

Bring the Warren dashboard's visual language into closer alignment with Tailwind Plus's Catalyst design system. The current `nextjs-ui/` app already imports Catalyst's React primitives under `app/components/` (button, dialog, switch, listbox, sidebar, etc.) — but most domain UI in `app/components/warren/` (RoomCard, ClimateTile, MotionTile, CameraTile, HueLightTile, LightGroupTile, MasterLightToggle, modals) was hand-rolled during the Nuxt-to-Next migration using semantic-token classes (`bg-surface`, `text-text`, etc.) that approximate Catalyst but don't match it pixel-for-pixel. The goal is to lean on the Catalyst primitives for chrome (buttons, switches, dialogs, dropdowns, badges, headings) and to tighten the bespoke domain components against Catalyst's spacing, typography, and color conventions so the whole app reads as "Catalyst with a sensor dashboard inside it" rather than "a sensor dashboard styled like Catalyst".

## Goals

- Use the Catalyst primitives (`Button`, `Dialog`, `Switch`, `Listbox`, `Dropdown`, `Heading`, `Text`, `Badge`, `Avatar`, `Sidebar`, `SidebarLayout`, `Input`, `Fieldset`, etc.) as the canonical interactive controls everywhere they fit, instead of hand-styled `<button class="btn-primary">` / `<input class="input">` / native `<dialog>`-style markup.
- Adopt Catalyst's spacing, typography, and ring/shadow conventions across the room dashboard, sensors page, lights page, and Hue integration page so headings, page chrome, and content cards look unmistakably Catalyst.
- Keep Warren's existing color-scheme system (`zinc-indigo`, `slate-sky`, etc.) and dark-mode token wiring functioning unchanged — Catalyst's neutral primitives need to remap correctly across all six schemes and both modes.
- Preserve the SidebarLayout shell that Catalyst already provides (the manual `SidebarShell` component would be replaced or rewritten on top of Catalyst's `Sidebar` + `SidebarLayout` primitives).
- Match Catalyst's iconography conventions (Heroicons sizes, stroke widths, position) consistently across sidebar, page headers, tiles, and dropdowns.
- The result should feel cohesive: a user familiar with the Catalyst demos should recognize Warren's chrome immediately, and the bespoke domain tiles should feel like a natural extension of that system.

## Non-Goals

- Not changing the dashboard's information architecture, page set, or core flows. Same routes, same tile types, same modals — just restyled and rebuilt on Catalyst.
- Not introducing new functionality (no new sensor types, no new pages, no new APIs).
- Not changing the API surface, server code, MQTT/Hue runtime, or the device-facing endpoints. This is purely a frontend visual + component-architecture refactor.
- Not adopting Catalyst's marketing-page templates (e.g. landing/hero blocks). Warren is an authenticated dashboard, not a marketing site.
- Not switching CSS frameworks or build tooling. Tailwind v4 + the existing PostCSS setup stays.
- Not changing the six color-scheme presets, the dark/light split, the `pointer-fine:` hover convention, or the `data-scheme` mechanism. Those are infrastructure; the Catalyst alignment runs on top of them.

## User Stories

- As a user opening the dashboard, I want page headers, buttons, and form controls to feel like Catalyst — so the app reads as a polished, modern admin UI rather than something that vaguely resembles one.
- As a user editing a room, I want the editing affordances (rename input, sliders, toggles, save button) to use the same primitives Catalyst's demos use, so labels, focus rings, hover states, and disabled states all behave the same way.
- As a user opening a modal (Add room, Add sensor, Light group editor, Sensor history, Hue pairing), I want the dialog chrome (header, body, footer, close button, primary/secondary actions) to use Catalyst's `Dialog` primitives so layout, padding, and animation are consistent across every modal in the app.
- As a developer adding a new modal or form later, I want the recipe to be obvious: import Catalyst's `Dialog`/`Button`/`Input`/`Fieldset` and compose them — not invent new `btn-*` and `input` utility classes.
- As a maintainer, I want fewer ad-hoc `className=…` strings in domain components and fewer custom `@layer components` definitions in `globals.css`, replaced by Catalyst primitives wherever they apply.

## Functional Requirements

### Layout chrome

- Replace the bespoke `app/components/warren/sidebar-shell.tsx` with a layout built on Catalyst's `SidebarLayout` + `Sidebar`/`SidebarSection`/`SidebarItem` primitives (already present in `app/components/`). Preserve the existing nav links (Dashboard, Sensors, Lights, Hue Bridge), the user menu (avatar, color scheme picker, theme toggle, change password, sign out), and the install-PWA affordance.
- Page headers use Catalyst's `Heading` for the title and `Text` (or its descendants) for the subtitle/last-updated line. Trailing actions ("Add room", search input, etc.) sit in a header row that matches Catalyst's typical `Heading + Button group` pattern.
- Stop hand-rolling the `<button class="btn-primary">` / `btn-secondary` / `btn-ghost` / `btn-danger` / `btn-icon` patterns from `globals.css`'s `@layer components` — replace call-sites with Catalyst's `Button` (with `color`, `outline`, and `plain` variants) and `Button` with an `aria-label` for icon-only buttons.

### Domain tiles

- Each tile (`ClimateTile`, `MotionTile`, `CameraTile`, `HueLightTile`, `LightGroupTile`) gets a once-over to:
  - Use Catalyst's typography scale (`Heading`, `Text`, `Strong`, `TextLink`) for the value, label, and meta lines.
  - Use Catalyst's `Badge` (with the appropriate `color` prop) for the offline / live / unreachable / partial-failure status indicators.
  - Use Catalyst's `Switch` for any per-tile on/off control where it fits (the bespoke "lit lightbulb" toggle on `HueLightTile` and `LightGroupTile` is the explicit exception — those domain-specific visuals stay, but their per-tile chrome around them becomes Catalyst).
  - Use Catalyst's `Button` (`plain`, icon-only) for the edit / remove / live-stream affordances that currently use `btn-icon`.
- The tile container itself (rounded ring, hover transition, padding) keeps Warren's semantic tokens but matches Catalyst's spacing scale (px-4 py-4 → px-5 py-5, etc.) where Catalyst's demos use larger padding.

### Modals

- Every modal in `app/components/warren/` (`AddRoomModal`, `AddSensorModal`, `ConfirmDialog`, `ChangePasswordModal`, `SensorConfigModal`, `SensorHistoryModal`, `LightGroupModal`, `LightGroupDetailModal`, `HuePairingModal`, `LiveStreamModal`) is rebuilt on Catalyst's `Dialog` family (`Dialog`, `DialogTitle`, `DialogDescription`, `DialogBody`, `DialogActions`).
- Form inputs use Catalyst's `Input`, `Textarea`, `Select`, `Listbox`, `Combobox`, `Fieldset`, `Field`, `Label`, `Description`, `ErrorMessage` — not raw `<input class="input">` / `<label class="label">` markup.
- Primary / secondary actions use Catalyst's `Button` with the standard `color="dark/zinc"` / `color="red"` / `outline` props instead of the `btn-primary` / `btn-danger` / `btn-secondary` utility classes.
- Confirm-style flows (delete room, delete sensor, ungroup, disconnect bridge) all share one Catalyst-styled `ConfirmDialog` wrapper that takes a title, message, confirm label, and tone (default vs destructive).

### Headings, text, and badges across pages

- Page-level titles ("Sensors", "Lights", "Philips Hue", "Dashboard") use `Heading` with the same level/size everywhere.
- Section subtitles ("Last updated …", "Manage every sensor …", "Connect a Hue Bridge …") use `Text` with consistent muted color.
- Status indicators (Connected / Unreachable / Hidden / Unassigned / Hue / On / Off / Mixed) use `Badge` with consistent color choices: success for "good", warning for "transient", error for "broken", neutral for "informational".

### Sidebar + user menu

- Sidebar nav links use Catalyst's `SidebarItem` (current/active state baked in) instead of hand-rolled `<Link className=…>`.
- The user-menu dropdown uses Catalyst's `Dropdown` primitives (`Dropdown`, `DropdownButton`, `DropdownMenu`, `DropdownItem`, `DropdownSection`, `DropdownLabel`) instead of the hand-rolled positioned-`<div>` approach. The Color scheme picker + Theme toggle live as `DropdownSection`s inside it; Change Password / Sign Out / Install Warren are individual `DropdownItem`s.

### Form pages

- The login page form gets restyled with Catalyst's `Fieldset` + `Field` + `Label` + `Input` + `Button` (`color="dark/zinc"`, `className="w-full"` for full-width). Error block uses `Text` with `color="red-500"` / `Catalyst Alert` if available.
- The "edit sensor label" inline dialog and the "edit room" inputs in `RoomCard` use Catalyst `Input` and Catalyst `Button` for consistency.

### Theme + scheme integration

- Catalyst's primitives reference Tailwind palette colors directly (`bg-zinc-900`, `text-zinc-500`, etc.). Where Catalyst hardcodes a neutral, Warren remaps it to its semantic token (`bg-surface`, `text-subtle`, `ring-default`) so the six color schemes still swap correctly. The plan step is responsible for itemizing exactly which Catalyst primitives need scheme-aware overrides and how (CSS overrides in `globals.css`, or fork-and-modify the primitive in `app/components/`).
- The `data-scheme` attribute, `warren:scheme` localStorage key, the inline `themeBootstrapScript`, and the `pointer-fine:` hover variant continue to work end-to-end after the refactor.

### Globals cleanup

- Remove or significantly shrink `@layer components` in `app/globals.css`. The hand-rolled `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-xs`, `.btn-icon`, `.input`, `.label`, `.help-text`, `.badge*`, and `.card`/`.panel` classes either become Catalyst primitives or stay as a small residual set for bespoke uses (e.g. the slider thumb styling, the warren-pulse animation).
- Document the "use Catalyst first" rule in `nextjs-ui/CLAUDE.md` so future changes don't drift back to inventing new utility classes.

## UI / UX

The app should be visually recognizable as Catalyst:

- Buttons match Catalyst's pill/rounded-md edges, accent + zinc neutral shading, focus-ring style, and hover/active transitions.
- Modals match Catalyst's title-body-actions layout with consistent vertical rhythm and the same backdrop blur/dim treatment.
- Form fields match Catalyst's label-on-top, description-below, error-below layout, with the same border + ring + focus treatment.
- Sidebar matches Catalyst's two-column shell: persistent left rail with sections + items, content panel with rounded corners on lg+.
- Dropdowns use Catalyst's exact menu styling (rounded, ring, shadow, divider sections).
- Page-level chrome — heading/subtitle/actions row, content area padding — matches the spacing rhythm used in Catalyst's demos.

What does NOT change visually:

- The six color-scheme presets and the dark/light split. Selecting `gray-rose` still produces a rose-accented Warren; toggling dark still does the same dark/light flip.
- The existing tile illustrations (rabbit logo, lit-bulb cluster on light groups, camera live-stream overlay, etc.).
- The PWA install prompts and iOS hint bubble.

## Data Model

No changes. This is purely a frontend visual/component refactor.

## API

No changes. Same endpoints, same shapes, same auth allowlist.

## Acceptance Criteria

- [ ] The sidebar layout, page headers, modals, and form controls are built on Catalyst's existing primitives in `app/components/` (Button, Dialog, Switch, Listbox, Dropdown, Sidebar/SidebarLayout, Heading, Text, Badge, Avatar, Input, Textarea, Fieldset, Field, Label, etc.).
- [ ] Every modal (`AddRoom`, `AddSensor`, `ConfirmDialog`, `ChangePassword`, `SensorConfig`, `SensorHistory`, `LightGroup`, `LightGroupDetail`, `HuePairing`, `LiveStream`) uses Catalyst's `Dialog` family for chrome and Catalyst's form primitives for inputs.
- [ ] Every per-tile / per-row destructive button (delete sensor, delete light group, etc.) routes through one shared Catalyst-styled `ConfirmDialog` wrapper.
- [ ] The login page is restyled with Catalyst's form primitives.
- [ ] Hand-rolled `@layer components` classes (`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-icon`, `.input`, `.label`, `.help-text`, `.badge*`, `.card`, `.panel`) are removed from `app/globals.css` (or trimmed to a small documented residual set for genuinely bespoke uses).
- [ ] The six color-scheme presets and dark/light flip continue to apply correctly across all Catalyst-driven chrome (verify each scheme + light-mode and dark-mode renders without obvious palette breakage).
- [ ] The `pointer-fine:` hover convention for auto-hide controls is preserved everywhere it was used (room edit/remove buttons, tile edit affordances).
- [ ] All Playwright E2E tests still pass without modification (auth, dashboard, device-API, light-group UI flow, Hue setup UI flow).
- [ ] `npm run build` succeeds.
- [ ] `nextjs-ui/CLAUDE.md` is updated with a "use Catalyst primitives first" guideline so future work doesn't regress to inventing new utility classes.

## Open Questions

- Which Catalyst primitives need to be forked or wrapped to honor Warren's `data-scheme` color-scheme system, vs which can use them as-is by overriding via Tailwind utility classes? The plan step should produce a primitive-by-primitive audit.
- Should the bespoke "lit-bulb cluster" illustration in `LightGroupTile` and the "rabbit head" logo in the sidebar/login page stay as-is, or be replaced with simpler Catalyst-style icons? Recommend keeping them — they're Warren's identity.
- Catalyst's components in `app/components/` are demo-quality but may not all be wired up. Are any incomplete/placeholder, and should the plan budget time to finish wiring them before using them?
- The current sliders (per-tile brightness, per-room target temp/humidity) use a custom `.slider` class with a webkit/moz thumb override. Catalyst doesn't ship a slider primitive — should we keep `.slider` as the single residual `@layer components` definition, or move it inline?
