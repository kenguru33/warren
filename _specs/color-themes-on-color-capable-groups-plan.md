# Implementation Plan: Restrict Color Themes to Color-Capable Light Groups

Companion to [`color-themes-on-color-capable-groups.md`](color-themes-on-color-capable-groups.md).

## 1. File-by-File Change List

### 1.1 [`nextjs-ui/lib/shared/types.ts`](../nextjs-ui/lib/shared/types.ts)

Add a sibling flag to the existing `hasBrightnessCapableMember` on `LightGroupView` (line 48):

- Add `hasColorCapableMember: boolean` to the `LightGroupView` interface (immediately after `hasBrightnessCapableMember`).

This is the cleanest carrier for the signal — it mirrors the existing pattern, costs nothing on the wire, and is computed once per group on the server (where the capability JSON has already been parsed).

### 1.2 [`nextjs-ui/lib/server/light-groups.ts`](../nextjs-ui/lib/server/light-groups.ts)

Two changes:

**(a) Compute `hasColorCapableMember` in `buildGroupView`** (around line 178–199):

- Right next to the existing `briCapable` computation (line 181), add:
  ```ts
  const colorCapable = members.filter(m => m.capabilities?.color === true)
  ```
- Add `hasColorCapableMember: colorCapable.length > 0,` to the returned object (after `hasBrightnessCapableMember`).

**(b) Add a coercion helper called from the rooms aggregation paths.** A small named helper is cleanest; place it in this file because it shares vocabulary with `buildGroupView` and uses the same `colorCapable.length === 0` test.

Add a new exported function (signature only, illustrative):

```ts
export function maybeCoerceGroupTheme(
  db: Database,
  group: GroupRow,
  members: SensorView[],
): GroupRow
```

Behaviour:
- Read `group.theme`. If it's null, undefined, or one of the four `WHITE_PRESET_KEYS`, return `group` unchanged.
- If it's a known color theme key (i.e. valid theme key but NOT in `WHITE_PRESET_KEYS`) AND `members.every(m => m.capabilities?.color !== true)` (zero color-capable members), then:
  - `db.prepare('UPDATE light_groups SET theme = ? WHERE id = ?').run('everyday', group.id)`
  - Return `{ ...group, theme: 'everyday' }`.
- Otherwise return `group` unchanged.

Notes:
- The "valid theme key" test should reject unknown values (e.g. legacy junk) — let `resolveLightTheme` keep handling those by falling back to `slate`. We coerce only when the persisted value is recognisable and is genuinely a color theme; this avoids rewriting unparseable garbage into `'everyday'`.
- The test `members.every(m => m.capabilities?.color !== true)` is the same predicate used to decide picker visibility — keeping them tied to one place avoids drift.

Add a sibling helper for per-light coercion:

```ts
export function maybeCoerceLightTheme(
  db: Database,
  deviceId: string,
  currentTheme: string | null,
): LightThemeKey | null
```

Behaviour:
- If `currentTheme` is null, unknown, or one of the four `WHITE_PRESET_KEYS`, return it unchanged (cast to `LightThemeKey | null`).
- If it's a known color theme key (recognised AND NOT in `WHITE_PRESET_KEYS`):
  - `db.prepare('UPDATE hue_light_state SET theme = ?, updated_at = ? WHERE device_id = ?').run('everyday', Date.now(), deviceId)`
  - Return `'everyday'`.
- Single-light pickers never offer color themes regardless of bulb capabilities, so there is no capability test here — ALWAYS coerce a recognised color key on a per-light row.

### 1.3 [`nextjs-ui/app/api/rooms/route.ts`](../nextjs-ui/app/api/rooms/route.ts)

Wire the coercion into the rooms aggregation (around line 134–138):

- For each group, call `maybeCoerceGroupTheme(db, g, memberSensors)` and pass the resulting (possibly mutated) row to `buildGroupView`.
  ```ts
  const lightGroups = roomGroups.map(g => {
    const memberIds = allMembers.filter(m => m.group_id === g.id).map(m => m.sensor_id)
    const memberSensors = memberIds.map(id => sensorsById.get(id)).filter((s): s is SensorView => !!s)
    const coerced = maybeCoerceGroupTheme(db, g, memberSensors)
    return buildGroupView(coerced, memberSensors)
  })
  ```

This runs once per `/api/rooms` GET, but since the helper short-circuits in O(1) for already-coerced rows (theme is null, white preset, or unknown), it's cheap and idempotent on re-reads. The UPDATE only fires on the first read of a row that's currently a color theme on a zero-color-capable group.

Also wire single-light coercion at row build time. In the `sensorViews` `.map` callback (line 99–130) where `lightTheme` is read (line 125):
- Call `maybeCoerceLightTheme(db, s.device_id, s.hue_theme)` (only when `s.device_id` is non-null) and write the returned value into `lightTheme`.

### 1.4 [`nextjs-ui/app/api/sensors/route.ts`](../nextjs-ui/app/api/sensors/route.ts)

Same per-light coercion as in `/api/rooms`. The `assigned` SQL also returns `hls.theme AS hue_theme` (line 21) and the row is later mapped at line 154 with `lightTheme: s.hue_theme`. Apply `maybeCoerceLightTheme(db, s.device_id, s.hue_theme)` and write the coerced value into the response.

Note: this route's `assigned` block currently writes `lightTheme: s.hue_theme` (line 154) without the `isValidLightThemeKey` guard that `/api/rooms` has (line 125). Keep that nuance — coerce first, then let the response carry the result.

### 1.5 [`nextjs-ui/app/api/light-groups/[id]/state/route.ts`](../nextjs-ui/app/api/light-groups/[id]/state/route.ts)

The POST handler reads `group.theme` at line 28–29 and resolves it at line 46. To honour "first read coerces" symmetry, before resolving the theme:

- Fetch the group's members (already done at line 32–40).
- Call `maybeCoerceGroupTheme(db, group, members)` — but the members here are `FanOutMember` rows, not `SensorView`. So either:
  - Use the raw rows: `maybeCoerceGroupTheme` should accept either `SensorView[]` or a thin shape with just `capabilities` (a string JSON or already parsed). Easiest: signature accepts `Array<{ capabilities: SensorCapabilities | string | null | undefined }>` and the helper handles both.
  - Or: add a `maybeCoerceGroupThemeRaw(db, group, members: FanOutMember[])` that parses each `capabilities` once.

Pick the simpler path — generalise `maybeCoerceGroupTheme`'s `members` param to accept anything with a `capabilities` field that's either parsed `SensorCapabilities` or a JSON string. The implementation parses if needed, then tests `caps?.color === true`.

After coercion, use the (possibly updated) `theme` in the `resolveLightTheme` call.

This is symmetric with the read path: any reach into a group's persisted theme triggers the one-shot coercion.

### 1.6 [`nextjs-ui/app/components/warren/light-theme-picker.tsx`](../nextjs-ui/app/components/warren/light-theme-picker.tsx)

Add a `hideColors` prop:

```ts
export function LightThemePicker({
  value,
  onChange,
  hideColors = false,
}: {
  value: LightThemeKey
  onChange: (key: LightThemeKey) => void
  hideColors?: boolean
}) {
  ...
  return (
    <Listbox value={value} onChange={onChange} aria-label={selectedTheme.label}>
      <SectionHeading>Whites</SectionHeading>
      {WHITE_PRESET_KEYS.map(k => <ThemeOption key={k} theme={LIGHT_THEMES[k]} />)}
      {!hideColors && (
        <>
          <SectionHeading>Colors</SectionHeading>
          {colorKeys.map(k => <ThemeOption key={k} theme={LIGHT_THEMES[k]} />)}
        </>
      )}
    </Listbox>
  )
}
```

Spec calls for "no header, no swatches, no empty placeholder" — the conditional renders nothing at all, matching the requirement.

The alternative of a `WhiteOnlyLightThemePicker` variant was considered and rejected: the picker is small (one component, ~17 lines of body), and a boolean prop is consistent with how the rest of the codebase parametrises its controls.

### 1.7 [`nextjs-ui/app/components/warren/edit-light-modal.tsx`](../nextjs-ui/app/components/warren/edit-light-modal.tsx)

Single-light path always passes `hideColors`. Update the picker call (line 173):

```ts
<LightThemePicker value={theme ?? 'everyday'} onChange={applyTheme} hideColors />
```

Two changes from current:
- `hideColors` prop added.
- Default fallback changes from `'slate'` (a color theme, no longer offered here) to `'everyday'` (a white preset that IS offered). The picker's listbox button label tracks this, so the visible label always matches a preset that's actually selectable. Coercion on the read side guarantees the persisted state lines up with this fallback.

### 1.8 [`nextjs-ui/app/components/warren/light-group-detail-modal.tsx`](../nextjs-ui/app/components/warren/light-group-detail-modal.tsx)

Group path passes the new flag. Update the picker call (line 123):

```ts
<LightThemePicker
  value={localTheme ?? group.theme}
  onChange={onThemeChange}
  hideColors={!group.hasColorCapableMember}
/>
```

The "open pickers don't hot-swap" rule is satisfied implicitly because `group` comes from props that are stable while the dialog is mounted (the `useEffect` at line 44 only resets local state on `group?.id` / `group?.theme` change, and a parent refetch that flips `hasColorCapableMember` does NOT re-mount the dialog). The next time the user opens the dialog, the new value is read.

---

## 2. Surfacing the "color-capable group" signal

Recommended: **add `hasColorCapableMember` to `LightGroupView` and compute in `buildGroupView`.**

Rationale, after inspecting both call sites:

- **`/api/rooms`** (`app/api/rooms/route.ts:134–138`) already builds `LightGroupView` per group via `buildGroupView(g, memberSensors)`. Adding a single line to `buildGroupView` (mirror of `briCapable`) is one-line code churn.
- **Dashboard's group detail modal** (`app/(dashboard)/page.tsx:43–56` and `light-group-detail-modal.tsx:123`) — the modal already receives both `group: LightGroupView` and `members: SensorView[]`. So technically client-side computation is also one-liner: `members.some(m => m.capabilities?.color === true)`.

Both are equally cheap. The deciding factor is consistency: `hasBrightnessCapableMember` is already on `LightGroupView` and consumed in `light-group-tile.tsx:279`. Following the established pattern keeps the picker visibility logic on the server (where the capability data has already been parsed once and where future clients/test harnesses can rely on a stable contract). It also localises the rule: the same `colorCapable.length > 0` predicate that drives `hasColorCapableMember` is the same predicate the coercion helper inverts to decide whether to coerce. Defining it once in `light-groups.ts` keeps them lockstep.

Server-side wins.

---

## 3. Picker API changes

Prop shape: **`hideColors?: boolean`** (defaults to `false`).

- `EditLightModal` (single-light) passes `hideColors` (true) at all times.
- `LightGroupDetailModal` passes `hideColors={!group.hasColorCapableMember}`.

Rejected alternatives:
- **Two component variants.** Adds a parallel file for a five-line difference. Not worth it.
- **`mode: 'whitesOnly' | 'all'`.** More expressive but the codebase favours boolean props for binary toggles (`Button plain`, `Switch checked`).
- **Compute from `members` inside the picker.** Couples the picker to data shapes it doesn't otherwise need. Both call sites are happy to pass a derived flag.

The two call-site signatures become:

```ts
// edit-light-modal.tsx:173
<LightThemePicker value={theme ?? 'everyday'} onChange={applyTheme} hideColors />

// light-group-detail-modal.tsx:123
<LightThemePicker
  value={localTheme ?? group.theme}
  onChange={onThemeChange}
  hideColors={!group.hasColorCapableMember}
/>
```

---

## 4. Coercion implementation

Pick **option (b): a small helper called from a few well-defined chokepoints.** Reasons:
- Keeps the SQL out of route handlers (`app/api/rooms/route.ts` is already 165 lines).
- Lets `app/api/light-groups/[id]/state/route.ts` reuse the same helper before reading `group.theme` for fan-out.
- Predicate `members.every(m => caps?.color !== true)` is identical to the inverse of `hasColorCapableMember` — defining it once keeps them in sync.

### Helpers (all in `lib/server/light-groups.ts`)

**`maybeCoerceGroupTheme(db, group, members)`**
- Members shape: `Array<{ capabilities: SensorCapabilities | string | null | undefined }>` — accepts both already-parsed `SensorView`-style and raw `FanOutMember`-style rows. Helper parses if needed.
- Eligibility test:
  - `group.theme` is a known theme key (`isValidLightThemeKey(group.theme)`)
  - AND `group.theme` is NOT in `WHITE_PRESET_KEYS`
  - AND no member has `caps?.color === true`
- SQL: `UPDATE light_groups SET theme = 'everyday' WHERE id = ?` with params `[group.id]`.
- Returns: `{ ...group, theme: 'everyday' }` or unchanged `group`.

**`maybeCoerceLightTheme(db, deviceId, currentTheme)`**
- Eligibility test:
  - `currentTheme` is a known theme key
  - AND `currentTheme` is NOT in `WHITE_PRESET_KEYS`
  - (No capability test — single-light pickers never offer color themes regardless of bulb capabilities, per the spec's UX rules. ALWAYS coerce.)
- SQL: `UPDATE hue_light_state SET theme = 'everyday', updated_at = ? WHERE device_id = ?` with params `[Date.now(), deviceId]`.
- Returns: `'everyday'` (`LightThemeKey`) on coercion, `currentTheme` (cast / null-passed) otherwise.

### Chokepoints (all four read paths)

1. **`app/api/rooms/route.ts` GET** — call both helpers:
   - `maybeCoerceLightTheme` while building each `SensorView` (per row, only the ones with `s.device_id`).
   - `maybeCoerceGroupTheme` per group before `buildGroupView`.
2. **`app/api/sensors/route.ts` GET** — call `maybeCoerceLightTheme` while building each assigned-sensor row at line 154.
3. **`app/api/light-groups/[id]/state/route.ts` POST** — call `maybeCoerceGroupTheme` after fetching members but before `resolveLightTheme(themeOverride ?? group.theme)`. This way the fan-out paint uses the coerced value (so we don't paint a stale color theme on a now-white-only group).

### Why these specific writes

- `light_groups.theme` is the ONLY canonical source for the group's theme. UPDATE in place; subsequent reads hit the coerced value and the eligibility test fails immediately (it's now `'everyday'`, a white preset → ineligible). One-shot, idempotent.
- `hue_light_state.theme` is the ONLY canonical source for per-light theme. Same one-shot logic; the existing `updated_at` column is bumped by convention (every write to this table updates `updated_at`).

### When this fires for groups (precise)

A group's theme is coerced **only** when, AT THAT MOMENT, the group has zero color-capable members AND its persisted theme is a recognised color theme. Once coerced, the row is `'everyday'` (a white preset) — eligibility fails on every subsequent read, so it is never coerced again.

If a color-capable member is added LATER, the group's now-`'everyday'` theme stays `'everyday'` (we don't undo coercion). The user can re-pick a color theme via the picker (which is now visible again because `hasColorCapableMember` flipped true).

---

## 5. Reading-side recomputation

`buildGroupView` returns `theme: resolveLightTheme(group.theme).key` (line 197). Because the GET aggregation in `app/api/rooms/route.ts` calls `maybeCoerceGroupTheme` BEFORE `buildGroupView`, the `group` row passed in already carries the (possibly just-coerced) `'everyday'`. So `resolveLightTheme('everyday').key` returns `'everyday'`, and the client sees `LightGroupView.theme === 'everyday'` from the very first render after coercion. Tile chrome (`LightGroupTile`), the detail modal's `localTheme` initial value, and the row palette all reflect `'everyday'` immediately.

Same logic for per-light: `lightTheme` is set from the helper's return value, so `SensorView.lightTheme` returns the coerced `'everyday'` on the same response that performed the UPDATE.

Subsequent reads short-circuit (eligibility test fails on `'everyday'` because it's a white preset key), no UPDATE fires, and the value flows through unchanged.

---

## 6. Edge cases to test

| # | Case | Expected behaviour |
|---|------|-------------------|
| 1 | Single light with persisted color theme (e.g. `rose`) | First GET coerces `hue_light_state.theme` to `'everyday'`, response carries `lightTheme: 'everyday'`, tile chrome reflects everyday. Second GET: no UPDATE, value unchanged. |
| 2 | Group with all white-only members + persisted color theme (e.g. `emerald`) | First GET coerces `light_groups.theme` to `'everyday'`. `LightGroupView.theme === 'everyday'`, `hasColorCapableMember === false`. Picker hides Colors section. |
| 3 | Group with mixed members (one color, several white-only), persisted color theme | No coercion. `hasColorCapableMember === true`. Picker shows both sections. |
| 4 | Group with all color members, persisted color theme | No coercion. `hasColorCapableMember === true`. Picker shows both sections. |
| 5 | Group becomes white-only after a member is removed | The DELETE goes through `app/api/light-groups/[id]/route.ts`; that handler does not call the coercion helper. Coercion fires on the NEXT read of the group through one of the three GET chokepoints — exactly matching the spec's "first read after this feature ships" rule, applied to "first read after the qualification flipped". |
| 6 | Hue-device row whose `capabilities` JSON is null or unparseable | Treated as NOT color-capable. Helper's parser must gracefully handle `null` and JSON-parse errors. If a group has only such members, it qualifies for coercion. The picker visibility is `hasColorCapableMember === false`. |
| 7 | Already-coerced row | Helper short-circuits; `'everyday'` is in `WHITE_PRESET_KEYS` so the eligibility test bails before any SQL. |
| 8 | Persisted unknown theme key (legacy junk like `'mauve'`) | Helper rejects via `isValidLightThemeKey`; no UPDATE. Read-side `resolveLightTheme` falls back to `'slate'` as it does today. (We deliberately don't rewrite junk into `'everyday'` — leave the upstream resolution layer to handle invalid keys.) |
| 9 | `hue_light_state` row missing entirely (no `theme` to coerce) | LEFT JOIN returns null for `hue_theme`; helper sees null, eligibility fails, no UPDATE. |

### Existing test impact

`tests/e2e/light-group.spec.ts:35` ("UI: open light-group dialog and switch theme"):
- The fake bridge's `FAKE_LIGHTS` (in `lib/server/hue/client.ts:137`) includes:
  - `Fake Living Room` of type `Extended color light` — `lightCapabilities` returns `color: true` (line 254 — `t.includes('color')`).
  - `Fake Office` of type `Dimmable light` — `color: false`.
- The 2-light group is mixed (one color + one dimmable). `hasColorCapableMember === true`. Colors section is shown. The test picks "Amber" and expects the listbox option to be reachable. **No update needed.**

That said, this is now coincidental rather than guaranteed — the test should be made explicit. Either:
- Leave it as-is (mixed group; passes naturally).
- Add a short comment noting the dependency: "Group is mixed (color + dimmable); the Colors section remains visible after the color-capable-only feature ships."

---

## 7. Tests to add or extend

### API-level (Playwright `request` style, `tests/e2e/light-group.spec.ts` or sibling `light-theme-coercion.spec.ts`)

**Group coercion**:
1. Create a group with `theme: 'rose'` whose members are exclusively white-only fakes (need to seed the bridge with a second dimmable-only light, or stand up a fake with only `Dimmable light`s — the existing fake has 1 of each, so a single-member group won't work because the API requires ≥2 members; use the existing single dimmable plus another seeded white-only). Then GET `/api/rooms` and assert the response group has `theme === 'everyday'`. Re-GET and assert the row is still `'everyday'` and `light_groups.theme` in SQLite is `'everyday'` (probe via repeated GET response is sufficient).
2. Create a mixed group (color + dimmable, like the existing test pattern) with `theme: 'amber'`; GET `/api/rooms` and assert `theme === 'amber'` (no coercion).

**Per-light coercion**:
3. Set a single light's `hue_light_state.theme` to `'rose'` via `POST /api/integrations/hue/lights/[id]/state` with `{ theme: 'rose' }`. Then GET `/api/sensors` and assert that light's `lightTheme === 'everyday'`.
4. The `POST /api/light-groups/[id]/state` path also reads the group theme — assert that calling it on a white-only group with a color theme persisted causes the next `/api/rooms` read to return `'everyday'`. (This pins the symmetric chokepoint.)

**Idempotence**:
5. Coerce once (case 1 above), then GET `/api/rooms` again and capture timing — assert (via a debug hook or by observing a stable `light_groups.theme === 'everyday'` value) that no second UPDATE fires.

**Acceptance of color theme via API on white-only group**:
6. Issue `PATCH /api/light-groups/[id]` with `{ theme: 'rose' }` on a white-only group; assert `200`. Per the spec, the API still accepts it. Then GET — does `theme === 'rose'` come back, or is it coerced again? Per the spec's "first read coerces" rule, it would be coerced again on the next read. Confirm and document this in the test.

### UI-level (Playwright)

7. **Single-light picker hides Colors.** From the dashboard's `EditLightModal` (open via tile kebab → Edit), open the theme listbox; assert "Whites" header is visible and "Colors" header is not. Pick "Reading Light"; assert PATCH/POST fires and persists.
8. **Group picker on white-only group hides Colors.** Stand up a white-only group (e.g. two Dimmable fakes — needs a second fake light), open the group detail modal, open the theme listbox; assert "Whites" but no "Colors".
9. **Group picker on mixed/color group shows Colors.** This is the existing test (`light-group.spec.ts:35`) — keep it green.
10. **Coerced state reflects in tile chrome.** Seed a white-only group with `'emerald'` theme via direct PATCH, navigate to dashboard; assert the tile renders the everyday-theme chrome (off-border colour matching `LIGHT_THEMES.everyday.offBorder`, etc.), not emerald.

### Unit-ish (vitest if added; otherwise inline)

11. `maybeCoerceGroupTheme` test: feed a fake `Database` shim and assert correct UPDATE issued / not issued for each combination of (theme key in {null, 'amber', 'everyday', 'mauve'}) × (members in {empty, one color, all white-only}).

---

## 8. Sequencing

**Independent landings (each is a green small PR):**

- **A.** Add `hasColorCapableMember` to `LightGroupView` and compute in `buildGroupView`. Pure additive type/contract change; no consumers yet. Land first.
- **B.** Add `hideColors?` prop to `LightThemePicker`. Backward-compatible default of `false` keeps existing call sites unchanged. Land second; no behaviour change yet.

**Must land together:**

- **C.** Wire `hideColors` at the two call sites (`edit-light-modal.tsx`, `light-group-detail-modal.tsx`) AND introduce the coercion helpers AND wire them into the three GET chokepoints AND `POST /api/light-groups/[id]/state`.
  - The picker change and the coercion change must ship as one unit because:
    - If the picker hides colors but coercion is missing, users see `LightGroupView.theme === 'rose'` painted in everyday-style chrome (since the listbox button label resolves through `LIGHT_THEMES`), but the picker can't reach `'rose'`. Ugly intermediate state.
    - If coercion lands without picker gating, the coerced rows look fine but the picker still offers colors on white-only groups — partial fix.
- The `EditLightModal` fallback default change (`'slate'` → `'everyday'`) is part of C.

**Tests sequenced with the code:**

- A's landing: extend types, no test.
- B's landing: a small picker-prop unit/snapshot test.
- C's landing: cases 1, 2, 3, 4, 7, 8, 9, 10 from above.

**Risk-managed rollback:** if coercion misbehaves in production, the picker gating still works on its own (UI-only restriction). The coercion helpers can be hot-disabled by short-circuiting them to identity functions without rolling back the type or picker changes. This argues for keeping the helpers in a single file (`light-groups.ts`) so the kill switch is one location.

---

## Critical Files

- [`nextjs-ui/lib/shared/types.ts`](../nextjs-ui/lib/shared/types.ts)
- [`nextjs-ui/lib/server/light-groups.ts`](../nextjs-ui/lib/server/light-groups.ts)
- [`nextjs-ui/app/api/rooms/route.ts`](../nextjs-ui/app/api/rooms/route.ts)
- [`nextjs-ui/app/components/warren/light-theme-picker.tsx`](../nextjs-ui/app/components/warren/light-theme-picker.tsx)
- [`nextjs-ui/app/components/warren/light-group-detail-modal.tsx`](../nextjs-ui/app/components/warren/light-group-detail-modal.tsx)
