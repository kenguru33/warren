# Implementation Plan: Color Theme for Light Groups

Companion plan for [`light-group-color-theme.md`](light-group-color-theme.md). Each light group becomes assignable a curated color theme (6–8) that drives its tile's visual identity (off-border, on-state glow + gradient, side-bulb tint). Implementation has not started — this is the plan only.

## 1. Theme catalog shape

Location: new file `ui/shared/light-themes.ts`.

Why `shared/` rather than `app/composables/`: the catalog is referenced from both client (picker, tile, modal) **and** server (the route serializer needs the valid-key list to resolve `NULL`/unknown to default). `shared/` is already imported on both sides. A composable would force a client-only home and require key duplication on the server.

Recommended shape — flat const map, plus a resolver:

- `LightThemeKey` union of 6–8 keys (e.g. `'slate' | 'amber' | 'emerald' | 'rose' | 'indigo' | 'teal' | 'plum' | 'terracotta'` — exact set is an in-implementation design decision).
- `LightTheme` interface with: `key`, `label`, `swatch` (single rep hex for the picker dot), and the *derived* values the tile reads — `offBorder`, `onBorder`, `onGlow` (rgba), `onGradientFrom`, `onGradientTo`, `bulbTint`, `toggleOnBg`, optional `mixedRingOverride`.
- `LIGHT_THEMES: Record<LightThemeKey, LightTheme>` const.
- `DEFAULT_LIGHT_THEME: LightThemeKey = 'slate'` (or whatever neutral choice).
- `resolveLightTheme(key: string | null | undefined): LightTheme` that returns the default for null/unknown keys.

Recommendation: **flat const map**. Themes are static for the build; an object literal is the cheapest tile-render path, trivially tree-shakable, easy to iterate via `Object.values(LIGHT_THEMES)` for the picker, and the server reuses `key in LIGHT_THEMES` for validation. A computed lookup would only buy laziness we don't need.

## 2. Where colors are applied in `LightGroupTile.vue`

Hardcoded colors that the theme must override:

- `.sensor-tile { border: 1px solid #2a2f45 }` — off-state border.
- `.group-tile.is-on { background: linear-gradient(180deg, #1d2238 0%, #151825 100%); border-color: #4a6fa5 }` — on-state gradient + border.
- `.group-tile.is-mixed { border-color: rgba(168, 85, 247, 0.45) }` — mixed ring (theme does **not** normally override; see §3).
- `.toggle-btn.on { background: #4a6fa5; border-color: #a0c4ff; box-shadow: 0 0 14px rgba(160, 196, 255, 0.4) }` — toggle bg + glow.
- `.toggle-btn.on .b-back, .toggle-btn.on .b-side { opacity: 0.85 }` — side-bulb opacity (theme adds tint, not just opacity).
- `.chip-state` color (`#a0c4ff`) — keep as-is unless it reads poorly across themes; flag as in-implementation decision.

Recommendation: **CSS custom properties scoped to the tile root**, set via a single `:style` binding on the outer `.sensor-tile`:

```vue
<div class="sensor-tile group-tile" :style="themeVars" :class="...">
```

```ts
const theme = computed(() => resolveLightTheme(props.group.theme))
const themeVars = computed(() => ({
  '--theme-off-border':   theme.value.offBorder,
  '--theme-on-border':    theme.value.onBorder,
  '--theme-on-glow':      theme.value.onGlow,
  '--theme-on-bg':        theme.value.toggleOnBg,
  '--theme-on-grad-from': theme.value.onGradientFrom,
  '--theme-on-grad-to':   theme.value.onGradientTo,
  '--theme-bulb-tint':    theme.value.bulbTint,
  '--theme-mixed-ring':   theme.value.mixedRingOverride ?? 'rgba(168, 85, 247, 0.45)',
}))
```

CSS rules then become `var(--theme-*)` references. Why custom props over alternatives:

- **Dynamic class names** (`.theme-amber`, etc.) would need 8 × every selector — cartesian explosion in the stylesheet.
- **Inline `style` on every styled element** drops `:hover`/`:disabled` interplay and pseudo-element support (slider thumb).
- **Custom properties** set on the tile root cascade to all descendants (toggle, bulb stack), play nicely with the existing scoped styles, integrate with the container queries already in use, and yield a single source of truth per tile.

`HueLightTile.vue` is **not** touched — confirmed inaction honors the spec.

## 3. Mixed-state handling for purple-ish themes

Recommendation: **per-theme alternate mixed cue, only triggered for purple-ish themes**, via the optional `mixedRingOverride` field on the theme entry. For typical themes the mixed ring stays at the existing `rgba(168, 85, 247, 0.45)` purple; an `indigo` or `plum` theme entry sets `mixedRingOverride: 'rgba(251, 191, 36, 0.55)'` (amber) so the cue is still distinguishable.

Why not always-amber (option a): gratuitous color change for groups whose theme has nothing to do with purple — the dashboard already has purple as the "mixed" semantic; flipping it for everyone hurts learnability.

Why not stripe/pattern (option c): extra CSS surface, ambiguous against the existing crisp ring at small tile sizes. Per-theme override is the minimum viable; we can escalate to a pattern later if a user reports clashes.

The `--theme-mixed-ring` custom prop accommodates this; if `mixedRingOverride` is unset the resolver passes the default purple as the value.

## 4. Database migration

Confirmed table name: `light_groups` (in `ui/server/utils/db.ts`, the `CREATE TABLE IF NOT EXISTS light_groups (...)` block).

Two changes in `initDb()`:

- Add `theme TEXT` to the `CREATE TABLE IF NOT EXISTS light_groups` body so fresh installs get the column.
- After the existing migration block (alongside the `device_id` ALTER, which uses the same nullable-add pattern), add:
  ```ts
  const lgCols = db.pragma('table_info(light_groups)') as { name: string }[]
  if (!lgCols.some(c => c.name === 'theme')) {
    db.exec("ALTER TABLE light_groups ADD COLUMN theme TEXT")
  }
  ```

Nullable, no default. `NULL` ⇒ default theme.

Where the resolution to default happens: in `buildGroupView()` inside `ui/server/utils/light-groups.ts`. Extend `GroupRow` with `theme: string | null`, update the `fetchGroups()` SELECTs to include `theme`, and have `buildGroupView` set `theme: resolveLightTheme(group.theme).key` on the returned `LightGroupView`.

Why in the serializer, not a separate helper next to the query: `buildGroupView` is the single chokepoint for `LightGroupView`, so resolving there guarantees the spec's "client never needs fallback" rule without scattering call sites. A helper-next-to-query would be premature factoring for one consumer.

## 5. API surface

### `POST /api/rooms/:id/light-groups`
- Body fields: existing `name`, `sensorIds`, **plus** optional `theme: string | null`.
- Behavior: `theme` omitted/`null` → INSERT with `theme = NULL`. If present, validate.
- Response: existing return + `theme` (resolved key).

### `PATCH /api/light-groups/:id`
- Body fields: existing `name`, `sensorIds`, **plus** optional `theme: string | null`.
- Behavior: if `theme` is **present** in the body, `UPDATE light_groups SET theme = ?`. Explicit `null` stores `NULL` (revert to default). `undefined`/missing means "no change". Use `'theme' in body` (or `body?.theme !== undefined`), not a falsy check.
- Response: existing `{ ok: true }`.

### `GET /api/rooms`
- No body change. Returned `LightGroupView`s now include `theme: LightThemeKey` (resolved, never null).

### `DELETE /api/light-groups/:id`
- Unchanged.

### Validation: **400 reject** unknown keys

A new helper in `server/utils/light-groups.ts`:

```ts
export function validateGroupTheme(theme: unknown): string | null {
  if (theme === undefined || theme === null) return null
  if (typeof theme !== 'string' || !(theme in LIGHT_THEMES)) {
    throw createError({ statusCode: 400, message: 'unknown theme key' })
  }
  return theme
}
```

Justification for reject-over-coerce: the only client is our own UI, which only sends keys from the catalog; silent coerce hides client/catalog drift bugs which would be confusing to debug; a stored unknown key (catalog rename) is *separately* tolerated on read by the resolver — write-side strictness and read-side leniency protect different invariants.

## 6. Modal UI in `LightGroupModal.vue`

Placement: directly below the Group name `<label class="modal-field">`, before the "Lights" field, as a new `<label class="modal-field">` block titled "Color".

Shape (recommended): a single row of circular swatches, ~24–28 px diameter, `flex-wrap: wrap`, with the selected swatch ringed (e.g. 2 px outline in `#e2e8f0`) plus an inset checkmark or solid ring. Native `<button type="button">` per swatch with `aria-pressed`, `aria-label="Color: Amber"`, and `title` for hover. Tab-reachable.

Whether to include a small text label for the selected theme name beneath the row, vs. tooltip-only, is an in-implementation decision.

Form-state extension:

```ts
import { DEFAULT_LIGHT_THEME, LIGHT_THEMES, type LightThemeKey } from '../../shared/light-themes'

const themeKey = ref<LightThemeKey>(props.group?.theme ?? DEFAULT_LIGHT_THEME)
```

`save()` extends both POST and PATCH bodies:

- Create: `body: { name, sensorIds, theme: themeKey.value }`
- Edit: `body: { name, sensorIds, theme: themeKey.value }` — always sends the current selection so the "user changes only the theme" path works, and the "user changes name and theme together" path also works without divergence. PATCH is idempotent.

Cancel preserves persisted theme: nothing extra. The modal is unmounted on cancel, the local `themeKey` ref is GC'd, no `$fetch` fires, the parent's `LightGroupView.theme` (which came from the server) is untouched.

`canSave` does not need to depend on theme — the default ensures it's always valid.

## 7. File-by-file change list

In implementation order:

1. `ui/shared/light-themes.ts` *(new)* — `LightThemeKey`, `LightTheme`, `LIGHT_THEMES`, `DEFAULT_LIGHT_THEME`, `resolveLightTheme()`.
2. `ui/shared/types.ts` — add `theme: LightThemeKey` to `LightGroupView`. Import the type from `./light-themes`.
3. `ui/server/utils/db.ts` — add `theme TEXT` to the `CREATE TABLE IF NOT EXISTS light_groups` body; add the `ALTER TABLE` migration guard alongside the existing `device_id` migration.
4. `ui/server/utils/light-groups.ts` — extend `GroupRow` with `theme: string | null`; update `fetchGroups()` SELECTs to include `theme`; `buildGroupView` sets `theme: resolveLightTheme(group.theme).key`; add `validateGroupTheme()` helper.
5. `ui/server/api/rooms/[id]/light-groups.post.ts` — accept `theme` in body, validate, INSERT with the column.
6. `ui/server/api/light-groups/[id].patch.ts` — accept `theme` in body, validate, branch the UPDATE to set `theme` only when the field is present.
7. `ui/server/api/rooms/index.get.ts` — no functional change required (it goes through `buildGroupView`); verify the SELECT picked up `theme`.
8. `ui/app/components/LightGroupTile.vue` — import `resolveLightTheme`; add `theme` and `themeVars` computed; bind `:style="themeVars"`; replace hardcoded colors in `<style scoped>` with `var(--theme-*)`.
9. `ui/app/components/LightGroupModal.vue` — import theme catalog + default; add `themeKey` ref initialized from `props.group?.theme ?? DEFAULT_LIGHT_THEME`; add the swatch picker block under the name input; include `theme` in POST and PATCH bodies.
10. `ui/app/composables/useRooms.ts` — no change required (consumes `LightGroupView` opaquely; the new field rides along).

## 8. Sequencing

Each commit is independently shippable; the dashboard works between every step:

- **Commit A — schema + server**: steps 1, 2, 3, 4, 5, 6, 7. Server now sends `theme` on every `LightGroupView` (always default for existing rows). Existing UI ignores the new field.
- **Commit B — tile rendering**: step 8. Tile reads `props.group.theme` (already populated from commit A). Visual: identical to today because every row resolves to default until the modal can change it.
- **Commit C — modal picker**: step 9. Now users can pick and save themes.

A single-commit ship is also fine — sequencing matters mainly for review/revert.

## 9. Risks and edge cases

- **Pre-migration groups**: `theme = NULL` → resolver returns default. Covered.
- **Catalog renames later**: a stored key that no longer exists also resolves to default on read. Renames are safe at the read path. Writes of an old key would be rejected by `validateGroupTheme` — acceptable; user re-picks. Document in PR.
- **Mixed state colliding with a purple-ish theme**: handled by `mixedRingOverride` (§3). Risk: implementer forgets to set the override on a borderline theme — flag during palette finalization that any theme whose hue is in the 260°–310° range needs an override.
- **`is-on` gradient + theme conflict**: gradient currently goes `#1d2238 → #151825`. Replacing the top stop with a heavily saturated theme color (e.g. amber) could overpower the dark surface. Mitigation: in the catalog, `onGradientFrom` should be a **desaturated, 8–12% mix** of the theme color into `#1d2238`, not the pure swatch. Document this rule next to the catalog.
- **Toggle button readability**: the bulb-emoji glyphs are dark-on-color when the toggle is on. A theme like amber could wash the emoji out. Mitigation: keep `toggleOnBg` at the deep / saturated end of each theme's range, not the pastel swatch shown in the picker. The picker swatch can be brighter than `toggleOnBg`.
- **Color-blind users**: 8 colors at swatch size will overlap perceptually for some viewers. This feature is a convenience on top of the still-present text label, so the dashboard remains usable without color discrimination. Flag in the PR; future enhancement could add an icon or letter overlay to swatches.
- **Race: user opens modal, theme is updated by another tab**: same risk profile as today's name/members race; out of scope.
- **`PATCH` without theme in body**: must treat missing-`theme` as "no change", not as "set to default". Use `'theme' in body` / `body?.theme !== undefined` — not a falsy check, because explicit `null` does mean "reset to default".

## 10. Explicitly NOT changing

- Schema for `sensors`, `rooms`, `room_references`, `sensor_readings`, `hue_*` tables.
- `HueLightTile.vue` — confirmed unchanged; no theme prop, no theme styling.
- `MasterLightToggle.vue` — pill stays as-is.
- `RoomCard.vue` — layout unchanged; just passes the now-themed `LightGroupView` into `LightGroupTile`.
- The floating control pill, dashboard chrome, off-state purple-mixed ring default behavior (still purple unless theme overrides).
- API endpoints other than the three listed in §5.
- `useRooms.ts`, polling, error/partial badge semantics.

## 11. Verification

- **Create flow**: open "Group lights" on a room with ≥2 ungrouped lights. Picker renders with default pre-selected. Pick a different theme. Save. New tile renders with the chosen theme on first paint. Reload — theme survives.
- **Edit flow**: open Edit on an existing group. Picker shows current theme pre-selected. Change theme only. Save. Confirm members and name unchanged (open again to verify); tile re-renders with new theme.
- **Cancel preservation**: open Edit on a themed group. Pick a different theme. Cancel. Tile retains original theme. Re-open Edit — picker is back to original.
- **Default for legacy rows**: with a DB containing pre-migration `light_groups` rows, start the server. `GET /api/rooms` returns `theme: 'slate'` (default) for all of them. Tile renders default.
- **Six to eight visually distinct themes**: eyeball the picker — each swatch is distinguishable; no two themes produce confusable tiles side by side in the same room.
- **All-on / all-off / mixed**: in a themed group, toggle members so the group is all-off, all-on, mixed in turn. Confirm the off border picks up the theme tint, the on glow/border/gradient reflect the theme, and the mixed ring is still legible (and switches to the override color for purple-ish themes).
- **Badges/errors**: induce an unreachable light and a partial failure. Red unreachable and amber partial badges retain their colors regardless of theme.
- **Single-light tiles**: `HueLightTile` rendered before vs. after — identical.
- **Validation rejection**: `curl -X POST … -d '{"name":"x","sensorIds":[1,2],"theme":"bogus"}'` → 400.
- **Persistence across Hue resync**: trigger a sync; theme survives (stored in `light_groups`, untouched by sync).
- **`PATCH` minimal updates**: PATCH `{ theme: 'amber' }` only; name & members unchanged. PATCH `{ theme: null }`; group reverts to default. PATCH without `theme`; theme unchanged.
- **DELETE unaffected**: deleting a group leaves other groups' themes alone.

## Critical files

- `ui/shared/light-themes.ts` (new)
- `ui/shared/types.ts`
- `ui/server/utils/db.ts`
- `ui/server/utils/light-groups.ts`
- `ui/app/components/LightGroupTile.vue`
- `ui/app/components/LightGroupModal.vue`
