# Feature Spec: Adopt Tailwind CSS for Page Styling

## Overview

The Nuxt UI is currently styled with hand-written CSS inside per-component `<style scoped>` blocks, and only ships a single dark theme. The same color values (`#1e2130`, `#2a2f45`, `#4a6fa5`, `#a0c4ff`, `#e2e8f0`, etc.), spacing rhythm, border-radii, and modal/tile patterns are repeated across every component, so a small palette change requires editing dozens of files. This spec adopts Tailwind CSS as the styling framework for the Nuxt app, leans on **Tailwind Plus** (the paid component library, formerly Tailwind UI) for the building blocks of buttons, modals, menus, form inputs, and toggles, encodes the design tokens as a Tailwind theme, and adds **light and dark themes** — with dark as the default for users who have not chosen a preference. The existing pages and components are migrated to use Tailwind utilities, replacing the duplicated scoped CSS with a single shared design system.

## Goals

- Adopt Tailwind CSS as the primary styling mechanism for the Nuxt UI.
- Use Tailwind Plus (Tailwind UI) Vue components as the source for button, modal, menu, dropdown, form input, switch, and dialog primitives — copied into the codebase per Tailwind Plus's standard workflow and adapted to fit the existing components.
- Ship both light and dark themes, with dark as the default when the user has not made an explicit choice; the user's chosen theme persists across visits.
- Capture the current palette, spacing, and radii as a single source of truth in Tailwind's theme configuration, with semantic tokens that resolve correctly in both themes.
- Migrate existing pages and components from `<style scoped>` blocks to Tailwind utilities, deleting the duplicated CSS.
- Keep the light-group color theme system (CSS custom properties driven by `resolveLightTheme()`) working in both light and dark modes so per-group theming still functions.
- Preserve the existing dark-mode visual identity — when in dark mode after the migration, the pages should look effectively the same as today.

## Non-Goals

- No visual redesign of the dark theme. In dark mode the pages should look effectively identical to today; minor pixel-level differences from token rounding are acceptable.
- No new pages or features beyond the theme toggle itself.
- No automatic theme following the OS `prefers-color-scheme`. The default is unconditional dark; the user opts in to light explicitly. (Listed as an open question if the team disagrees.)
- No changes to the firmware or backend.
- No removal of `<style scoped>` blocks for cases utilities cannot express cleanly (keyframe animations, complex `:has()` / pseudo selectors, third-party widget overrides). These can stay as targeted scoped CSS.
- No changes to the current authentication, routing, or data layer.

## User Stories

- As a homeowner using the dashboard during the day, I want to switch to a light theme so the page is comfortable to read in bright rooms, and have it remember my choice across sessions.
- As a homeowner browsing in the evening or in a dim hallway, I want the dashboard to default to dark mode the first time I visit so I don't get blasted by a white screen.
- As a developer working on the dashboard, I want to express layout, spacing, and color directly in the template so I don't have to invent CSS class names or open a `<style>` block for routine styling.
- As a developer changing the brand palette, I want to edit one config file so that every component picks up the new colors without per-file edits.
- As a developer adding a new component, I want a documented set of design tokens (colors, spacings, radii) and a stock of Tailwind Plus primitives so I can stay visually consistent without copy-pasting hex codes or rebuilding modal shells.
- As a reviewer, I want PRs that touch styling to show clear, local intent (utility classes on the relevant element) instead of new entries in long scoped style sheets.

## Functional Requirements

### Tailwind setup

- Tailwind is installed via the official Nuxt module so it integrates with the existing dev server and build pipeline.
- The Tailwind config (or its CSS-first equivalent) lives at the Nuxt project root and is the single source of truth for design tokens.
- The build output for production must remain reasonable in size — purged / JIT mode is on, dev mode produces only the utilities used.

### Tailwind Plus components

- The team's Tailwind Plus license is used to source Vue templates for the building blocks: button, modal/dialog, menu/dropdown, form inputs, toggle/switch, listbox/select, and any other primitive needed by the existing screens.
- Components are copied into the codebase (the standard Tailwind Plus workflow) and adapted to fit the project's existing component contracts and emit/prop shapes — they are not loaded from a runtime package.
- Where a Tailwind Plus block exists for a UI element we already have (e.g. confirm dialog, color picker dropdown, toggle switch), the existing custom shell is replaced with the Tailwind Plus version and re-themed, rather than keeping two parallel implementations.

### Light and dark themes

- The app supports two themes: dark and light.
- Dark is the default the first time a user visits or when no preference has been stored.
- The user can switch themes from a visible control in the app shell (e.g. a sun/moon toggle in the dashboard header). The control's location should be discoverable on every page, not buried in a settings dialog.
- The chosen theme persists across page reloads and across sessions (e.g. via `localStorage`), and is applied early enough in page load that there is no flash of the wrong theme.
- The theme classes follow Tailwind's standard dark-mode pattern (the `dark` class on `<html>` toggles dark utilities throughout the tree).
- Server-side rendering, if any, must not flicker — the initial render should match the persisted preference (or dark when none is stored).

### Design tokens

The current palette and shape system must be captured as named tokens so utilities reference semantic names, not raw hex codes. Each token resolves to a different concrete value in dark vs. light theme. At minimum:

- Surface colors: app background, card background, elevated surface, modal surface, input surface.
- Border colors: subtle, default, focus / accent, error, warning.
- Text colors: primary, secondary, muted, accent, error, warning, success.
- Accent / brand color used for sliders, focus rings, and selected states.
- Status colors: heater on, fan on, light on, sensor offline, motion recent.
- Border radii used by tiles, modals, buttons, sliders.
- Standard spacing values used in card padding, section gaps, and tile grids.
- The `--theme-*` CSS custom properties used by the light-group theming system continue to work in both themes; their default values may differ between modes so that the tile borders/glows read well against the respective surface.

### Migration scope

Every page and component currently shipped with the UI is in scope. The migration covers (non-exhaustive — the implementation should cover everything under `ui/app/`):

- The dashboard page and its room cards.
- The light group tile, the light group detail modal and its rows, the create/edit modal, the shared theme picker.
- The Hue light tile, climate / motion / camera tiles, master light toggle.
- The confirm dialog and any other modal shells.
- Any login / auth screens and any settings or admin pages.

For each migrated component, the existing scoped `<style>` block should be removed except for the targeted exceptions listed under Non-Goals.

### Behavior preservation

- All existing transitions, hover states, focus-visible rings, and disabled states must work the same way after the migration, in both themes.
- Modal layering (z-index ordering: confirm dialog, edit modal, detail modal, theme dropdown) must be preserved.
- The light-group theming pipeline (CSS variables set inline by components, consumed by themed elements) must keep working.
- Keyboard interactions (Enter/Space on tiles, Escape closing modals, Tab focus order) must be unchanged.
- Touch and drag behavior on the brightness sliders must be unchanged (no regression in mobile interaction).

## UI / UX

- **Dark mode** is a 1:1 reproduction of today's look — same dark surfaces, accent blue, tile and modal proportions, hover and focus affordances. A side-by-side comparison of any page before and after migration in dark mode should be visually indistinguishable to a non-developer.
- **Light mode** is a new, clean light counterpart that uses the same component layout and accent identity but with light surfaces and dark-on-light text. It does not need to be a perfectly matching mirror; it needs to read well, hit reasonable contrast (WCAG AA for body text), and feel like the same app.
- **Theme toggle** is a small icon control in the app header, near the existing room actions / user controls. It shows the icon for the *next* state (e.g. sun icon when in dark mode), is keyboard-accessible, and changes theme without a full reload.
- **Persistence**: the chosen theme is stored locally; a returning user lands in their last theme. A user who has never picked one lands in dark mode regardless of their OS preference.
- **No flash of the wrong theme** on first paint — the persisted choice (or dark when none) is applied before the page becomes interactive.

## Data Model

No changes. This is a presentation-layer refactor.

## API

No changes. No new or modified endpoints.

## Acceptance Criteria

- [ ] Tailwind is installed and configured in the Nuxt UI; the dev server compiles utility classes successfully.
- [ ] Tailwind Plus templates are used as the source for shared primitives (button, modal, menu, dropdown, form input, switch, listbox); the equivalent custom-built shells are removed.
- [ ] The current palette, radii, and spacing rhythm are encoded as named, theme-aware design tokens; no Vue component references raw `#xxxxxx` hex values for these tokens after the migration.
- [ ] Every page and component listed under "Migration scope" is converted to Tailwind utility classes; their scoped `<style>` blocks are removed (other than the listed exceptions).
- [ ] A theme toggle is visible from the dashboard and switches between light and dark without a reload.
- [ ] First-visit users (no stored preference) land in dark mode.
- [ ] A user who picks light mode and reloads stays in light mode; same for switching back to dark.
- [ ] No flash of the wrong theme on initial page load in either mode.
- [ ] In dark mode, the dashboard, login, and any settings screens render visually the same as before the migration.
- [ ] In light mode, all pages render with adequate contrast (body text meets WCAG AA), no unreadable text, and no broken layouts.
- [ ] All hover, focus-visible, disabled, and active states behave the same as before, in both themes.
- [ ] Keyboard navigation (Tab order, Enter/Space on tiles, Escape on modals) is unchanged.
- [ ] The light-group color theme system still drives per-group border, glow, and gradient colors via the existing CSS custom properties — verified in both themes.
- [ ] Modal stacking order is unchanged.
- [ ] `npm run build` succeeds with no new TypeScript or Vue template errors.
- [ ] Production bundle size is not significantly larger than before the migration (Tailwind purges unused utilities).

## Open Questions

- Tailwind v4 (CSS-first config) or v3 (`tailwind.config.ts`)? v4 fits Nuxt 4 better but is newer; some plugins lag behind.
- Migrate all components in a single PR or incrementally? A single PR is cleaner to review for visual parity but is a large diff; an incremental migration leaves the codebase in a mixed state for a while.
- Use `@apply` to keep a few semantic class names (e.g. `.btn-primary`, `.tile`) for clarity, or go fully utility-first with no custom classes? Affects template readability vs. one-place-to-change ergonomics.
- Adopt a Tailwind plugin set (forms, typography, container-queries) or stick to core only?
- Replace the current dark color palette wholesale with Tailwind's `slate` / `zinc` ramps where they're a close match, or keep the exact existing hex values to guarantee zero visual drift in dark mode?
- Should the theme toggle expose a third "follow system" option in addition to dark/light, or stay binary (dark default + explicit light)?
- Should the user's theme choice be stored only client-side (`localStorage`) or also synced server-side per account so it follows them across devices?
- Tailwind Plus ships React, HTML, and Vue templates — confirm the Vue templates exist for every primitive we need (modal, dropdown, listbox, switch). Identify any gap before starting the migration.
- For the light-group color themes (slate, dracula, nord, etc.), do their off-border / glow values need separate light-mode variants, or is one set acceptable in both modes?
