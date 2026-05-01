# Feature Spec: Make Room Items Stand Out More

## Overview

The dashboard shows each room as a card containing its sensors, lights, and master toggles. After the Catalyst refactor the cards rest on a `bg-surface` panel inside an `lg:bg-surface-2` page background, ringed with `ring-default`. The visual contrast is subtle: at a glance rooms blend into the page chrome, the active room's sensors compete with the surrounding muted text, and "this is one room" is hard to read across the grid. We want the room card to feel like a distinct, important unit — clearly bounded, given some atmosphere, and easy to scan as a single entity — without inventing a new visual language.

## Goals

- Make each room visually distinct from the page background and from its neighbouring cards in the grid.
- Reinforce the room card as a single unit so a glance at the dashboard reads as "rooms," not "a list of sensors."
- Keep the visual treatment tied to the existing scheme tokens so all six color schemes × dark/light modes still look coherent.
- Preserve the room name as the primary anchor (it should be the first thing the eye lands on in a card).

## Non-Goals

- No backend or API changes. Sensor data, light state, and Hue calls stay as-is.
- No restructuring of which sensors live in which section of the card.
- No new room "type" or "theme" picker — rooms keep one neutral default look. (A separate spec can introduce per-room theming later if needed.)
- No mobile-specific re-layout beyond what falls out naturally from the new emphasis.

## User Stories

- As a returning user glancing at the dashboard, I want each room to clearly stand out as its own block so I can skim quickly and find the one I care about.
- As someone looking at a single card, I want the room name and master toggle to feel like the obvious primary controls, with the sensors visually subordinated underneath.
- As a user using a less common color scheme (e.g. stone-amber, gray-rose), I want the new emphasis to look intentional in my scheme and in both light and dark mode — not like a one-scheme hack.

## Functional Requirements

### Card emphasis

- Each room card must be visually separated from the page background by a stronger combination of background, ring/border, and elevation (shadow or subtle gradient) than the current `bg-surface ring-default shadow-sm`.
- Cards must remain visually consistent with each other — every room uses the same emphasis treatment.
- The visual emphasis must work in all six schemes and both modes; we do not introduce new color variables outside what `globals.css` already exposes (`bg-surface`, `bg-surface-2`, `ring-default`, `ring-strong`, `bg-accent-soft`, etc.).
- Hover state on a card may add a slightly stronger ring or elevation as a small affordance, but must not jump or shift layout.

### Header emphasis

- The room name and the master light toggle remain the top of the card. The room name typography should be raised in the visual hierarchy (size or weight) so it reads as the card's anchor.
- The header is visually separated from the card body (sensor / light sections) — for example via a subtle divider, a denser header band, or extra spacing — so the eye can take in the room name and master state without parsing the sensors.

### Section grouping inside the card

- The existing internal sections (climate / camera / lighting / per-room reference settings) keep their order, but their separators (currently a thin top border + small gap) must visibly belong to the card's new style and not look like a flat list.
- Empty rooms (no sensors yet) still need to look like a "room card" — the empty-state copy must sit in the new visual frame.

### Accessibility

- Color contrast for room name and meta text against the new card background must continue to meet WCAG AA in both light and dark modes for every scheme.
- Focus rings on interactive controls inside the card stay visible against the new background.
- Keyboard tab order is unchanged.

## UI / UX

The work is a visual refresh of `nextjs-ui/app/components/warren/room-card.tsx` plus the surrounding grid wrapper in `nextjs-ui/app/(dashboard)/page.tsx`.

Likely directions to explore (the implementation phase picks one):

- A more elevated card: thicker corner radius, a stronger ring (`ring-strong` or `ring-1.5`-equivalent), and a soft layered shadow in light mode / a subtle inner highlight in dark mode.
- A header band with a faint accent-tinted background (`bg-accent-soft` at low opacity, or a gradient from `bg-surface-2` into `bg-surface`) to separate name + master toggle from sensors.
- An accent edge — a thin colored bar along the top or left of the card using `bg-accent` or `bg-accent-strong` — so each card carries the active scheme's accent without needing per-room theming.
- Slightly increased gap between cards in the grid so the grid reads as discrete units instead of a wall of cards.

The dashboard grid layout (`grid-cols-1 lg:grid-cols-2 xl:grid-cols-3`) stays. Tile content inside the room card is unchanged.

## Data Model

No data model changes. Rooms, sensors, light groups, and references keep their existing shapes.

## API

No API changes.

## Acceptance Criteria

- [ ] Room cards are visibly distinct from the dashboard page background in all six schemes × both modes (manual visual pass).
- [ ] Room name and master toggle read as the top of the card; sensors read as a subordinate group below.
- [ ] No regression in existing Playwright suites (`auth`, `dashboard`, `device-api`, `light-group`, `hue-setup`).
- [ ] No new tokens added to `globals.css`; only existing semantic tokens are used in the card refresh.
- [ ] WCAG AA contrast verified for room name + subtle meta text in dark + light mode for at least the default `zinc-indigo` scheme and one accented scheme (e.g. `stone-amber`).
- [ ] Empty-state room (no sensors) still looks intentional inside the new card frame.
- [ ] No layout shift or reflow on hover; only a subtle ring/elevation change.

## Open Questions

- Should the card carry an explicit accent edge (top or left bar) to flag the active scheme, or stay neutral and rely solely on background/ring/shadow?
- Should the master light toggle in the header gain its own emphasis treatment (e.g. always-visible wide variant), or stay as it is today?
- Is "container queries" worth pursuing for inner card layout shifts at narrow card widths, or do we keep the current breakpoints?
- Do we want a slightly larger gap between grid cells, and if so, does it stay constant across breakpoints?
