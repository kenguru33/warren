# Implementation Plan: Warm / Everyday / Reading / Nightlight Presets

Companion to [`warm-normal-reading-light-themes.md`](warm-normal-reading-light-themes.md).

## 1. File-by-file change list

### New files
None required. Everything fits inside existing modules. (One optional new file in §10 below for tests.)

### Edited files

| File | Change summary |
|---|---|
| [`nextjs-ui/lib/shared/light-themes.ts`](../nextjs-ui/lib/shared/light-themes.ts) | Extend `LightThemeKey` union with four white keys; introduce a discriminated `bulbOutput` field; add four catalog entries; export a small helper `whitePresetPayload()` so server code can derive `{ ct, bri }` from a theme without `instanceof`-style branching. |
| [`nextjs-ui/lib/server/hue/client.ts`](../nextjs-ui/lib/server/hue/client.ts) | Extend the `body` parameter of `setLightState()` to accept `ct?: number`. Add a `buildHueLightStateBody()` helper (or just widen the type — see §3) so payload merging is centralized. |
| [`nextjs-ui/lib/server/light-groups.ts`](../nextjs-ui/lib/server/light-groups.ts) | Teach `fanOutLightCommand()` about white-preset themes: when `themeForColors.bulbOutput.kind === 'white'`, override `briScaled` from the preset, build `{ ct }` for color-temp-capable members, build `{ xy }` (CCT→xy approximation) for color-only members, skip color writes on dimmable-only members, and persist `theme` per device when applicable. |
| [`nextjs-ui/lib/server/db.ts`](../nextjs-ui/lib/server/db.ts) | Add a `theme TEXT` column to `hue_light_state` via the existing `pragma('table_info')` pattern (no shadow-table needed — adding a NULL-allowed TEXT is safe). |
| [`nextjs-ui/app/api/integrations/hue/lights/[id]/state/route.ts`](../nextjs-ui/app/api/integrations/hue/lights/[id]/state/route.ts) | When `body.theme` resolves to a white preset: write `{ on, ct, bri }` (capability-gated), persist `theme` into `hue_light_state.theme`. |
| [`nextjs-ui/app/api/light-groups/[id]/state/route.ts`](../nextjs-ui/app/api/light-groups/[id]/state/route.ts) | No structural change — `fanOutLightCommand()` already receives the resolved theme. Confirm that `body.brightness` from the client does NOT clobber the preset's pinned brightness when `body.theme` is also a white preset (server resolves which wins; spec says preset wins on apply). |
| [`nextjs-ui/app/api/lights/master-state/route.ts`](../nextjs-ui/app/api/lights/master-state/route.ts) | The existing master `POST` only handles `{on}` — no theme. No change to that handler. (See §9 Edge Cases for the off→on round-trip behaviour the spec implicitly requires.) |
| [`nextjs-ui/app/components/warren/light-theme-picker.tsx`](../nextjs-ui/app/components/warren/light-theme-picker.tsx) | Replace flat `Listbox` with a sectioned listbox using `<ListboxSection>` + `<ListboxHeading>`. Render preset swatches differently (CCT-tinted square + bri dot — see §5). Order: Whites first, Colors after. |
| [`nextjs-ui/app/components/warren/light-group-detail-modal.tsx`](../nextjs-ui/app/components/warren/light-group-detail-modal.tsx) | Field label changes from "Color theme" → "Theme" (since whites aren't colors). The fire-and-forget paint at line 92-99 stays the same — server-side code does the right thing. |
| [`nextjs-ui/app/components/warren/light-group-tile.tsx`](../nextjs-ui/app/components/warren/light-group-tile.tsx) | Tile already pulls `theme.onBorder/onGlow/bulbTint`; whites just supply different values. Bulb-cluster gradient at line 230-234 currently uses `theme.bulbPalette` — for whites the array is empty, so this needs a fallback. Plan: keep `bulbPalette` non-empty for whites (fill with three near-white tints derived from the preset's CCT), so the cluster paints as a soft warm/cool gradient that reads as white. |
| [`nextjs-ui/app/components/warren/light-group-detail-row.tsx`](../nextjs-ui/app/components/warren/light-group-detail-row.tsx) | No structural change. The `accentColor` (line 14, set in `light-group-detail-modal.tsx` line 137-147 from `palette[i % palette.length]`) will simply pick a near-white tint when the active theme is a white preset — chrome reads correctly. |
| [`nextjs-ui/app/components/warren/edit-light-modal.tsx`](../nextjs-ui/app/components/warren/edit-light-modal.tsx) | Optional: today this dialog has no theme picker (custom hex only). The spec says "the theme picker (in single-light controls and the light-group editor)" — so we add a `<LightThemePicker>` above the `PalettePicker`/`LightColorPicker`. When a white preset is chosen, POST `{ theme }` to the existing per-light state endpoint. |
| [`nextjs-ui/app/components/warren/hue-light-tile.tsx`](../nextjs-ui/app/components/warren/hue-light-tile.tsx) | If we want per-light tile chrome to follow the preset (spec acceptance criteria require this), the tile must read the persisted `theme` from `SensorView` (currently absent from `SensorView`). Either: (a) add `lightTheme?: LightThemeKey` to `SensorView` and surface from the rooms aggregation, or (b) keep tile chrome tied to the override-color the user last picked. Recommend (a) — see §7. |
| [`nextjs-ui/lib/shared/types.ts`](../nextjs-ui/lib/shared/types.ts) | Add `lightTheme?: LightThemeKey \| null` to `SensorView` (line 11-32). |
| [`nextjs-ui/lib/server/hue/runtime.ts`](../nextjs-ui/lib/server/hue/runtime.ts) | At `upsertLight` (lines 81-95) — already does NOT touch `theme` — confirmed safe. No change needed for theme persistence. (See §8 Poller Respect for the brightness/on caveat, which is more subtle.) |

---

## 2. Theme catalog additions

Picked keys (camelCase, consistent with `tokyoNight`): **`warmLight`**, **`everyday`**, **`readingLight`**, **`nightlight`**.

### Discriminated union for bulb output

Today every theme exposes `bulbPalette: string[]`. Color themes use the palette round-robin in `paletteColorFor()`; whites need a CCT + brightness instead. Cleanest fit for this codebase:

```ts
type BulbOutput =
  | { kind: 'palette'; colors: string[] }
  | { kind: 'white'; mirek: number; brightness: number }   // brightness = 0..100

interface LightTheme {
  key: LightThemeKey
  label: string
  swatch: string
  bulbTint: string
  toggleOnBg: string
  bulbOutput: BulbOutput
  bulbPalette: string[]   // kept for tile chrome; white themes fill with 3 near-white tints
  light?: LightThemeSurfaceVariant
  // ...existing surface fields
}
```

Why keep `bulbPalette` even for whites: `light-group-tile.tsx:230` paints the bulb-cluster gradient with `theme.bulbPalette.join(',')`, and `light-group-detail-modal.tsx:137` slices `palette[i % len]` for per-row accent dots. Filling `bulbPalette` with three near-white tints derived from the CCT (e.g. `['#ffd9a8', '#ffe6c4', '#fff1de']` for warm) makes both call sites continue to render correctly without branching. `paletteColorFor()` keeps working unchanged — it just returns near-white-tinted hexes for white themes, which are good fallbacks for color-capable bulbs that for some reason don't get the CT branch (defence-in-depth).

Add a small accessor:

```ts
export function whitePresetPayload(theme: LightTheme): { mirek: number; brightness: number } | null {
  return theme.bulbOutput.kind === 'white' ? theme.bulbOutput : null
}
```

### Concrete catalog entries

Hue mirek range is 153 (~6500K) – 500 (~2000K). Mirek = 1,000,000 / kelvin.

| Key | Label | CCT | Mirek | Brightness | Swatch (CCT-tinted) | Notes |
|---|---|---|---|---|---|---|
| `warmLight` | Warm Light | ~2700 K | **370** | 60 | `#ffd9a8` (amber-ish white) | "relaxing candlelight" |
| `everyday` | Everyday | ~3500 K | **286** | 100 | `#fff1de` (neutral white) | sensible default |
| `readingLight` | Reading Light | ~4500 K | **222** | 100 | `#dce8ff` (cool white) | bright/cool for tasks |
| `nightlight` | Nightlight | ~2200 K | **454** | 10 | `#ffb98a` + dim outline | very warm, very dim |

Tile chrome fields (dark mode primary; `light` variant analogous):

```ts
warmLight: {
  swatch: '#ffd9a8',
  offBorder:        '#3a2e1f',
  onBorder:         '#d4a373',
  onGlow:           'rgba(255, 217, 168, 0.45)',
  onGradientFrom:   '#2a2218',
  onGradientTo:     '#151825',
  bulbTint:         'rgba(255, 217, 168, 0.55)',
  toggleOnBg:       '#a06a37',
  bulbOutput:       { kind: 'white', mirek: 370, brightness: 60 },
  bulbPalette:      ['#ffd9a8', '#ffe6c4', '#fff1de'],
  light: { offBorder: '#fde4c4', onBorder: '#a06a37',
           onGlow: 'rgba(160, 106, 55, 0.25)',
           onGradientFrom: '#fff7ee', onGradientTo: '#ffffff' },
},
everyday: {
  swatch: '#fff1de',
  offBorder:        '#2c2a26',
  onBorder:         '#cdbfa6',
  onGlow:           'rgba(255, 241, 222, 0.4)',
  onGradientFrom:   '#262421',
  onGradientTo:     '#151825',
  bulbTint:         'rgba(255, 241, 222, 0.45)',
  toggleOnBg:       '#857b6a',
  bulbOutput:       { kind: 'white', mirek: 286, brightness: 100 },
  bulbPalette:      ['#fff1de', '#fff8ec', '#ffffff'],
  light: { offBorder: '#e7dfd0', onBorder: '#857b6a',
           onGlow: 'rgba(133, 123, 106, 0.18)',
           onGradientFrom: '#faf7f2', onGradientTo: '#ffffff' },
},
readingLight: {
  swatch: '#dce8ff',
  offBorder:        '#1f2733',
  onBorder:         '#9fb6e0',
  onGlow:           'rgba(220, 232, 255, 0.45)',
  onGradientFrom:   '#1c2230',
  onGradientTo:     '#151825',
  bulbTint:         'rgba(220, 232, 255, 0.55)',
  toggleOnBg:       '#5b7bb8',
  bulbOutput:       { kind: 'white', mirek: 222, brightness: 100 },
  bulbPalette:      ['#dce8ff', '#eaf2ff', '#ffffff'],
  light: { offBorder: '#cfdbef', onBorder: '#5b7bb8',
           onGlow: 'rgba(91, 123, 184, 0.22)',
           onGradientFrom: '#eef3fb', onGradientTo: '#ffffff' },
},
nightlight: {
  swatch: '#ffb98a',
  offBorder:        '#241a14',
  onBorder:         '#7a4f30',          // *muted* on-border, signals dim
  onGlow:           'rgba(255, 185, 138, 0.18)',  // dimmer alpha than Warm
  onGradientFrom:   '#1d1814',
  onGradientTo:     '#151215',
  bulbTint:         'rgba(255, 185, 138, 0.30)',  // lower alpha for the bulb drop-shadow
  toggleOnBg:       '#5a3820',
  bulbOutput:       { kind: 'white', mirek: 454, brightness: 10 },
  bulbPalette:      ['#ffb98a', '#ffcca8', '#ffe2c8'],
  light: { offBorder: '#e8d5c2', onBorder: '#7a4f30',
           onGlow: 'rgba(122, 79, 48, 0.18)',
           onGradientFrom: '#fbf2e8', onGradientTo: '#ffffff' },
},
```

The deliberately-low `onGlow` and `bulbTint` alphas on Nightlight produce the "visibly dim" tile chrome the spec calls for, *without* needing any new code branch. Existing CSS variables (`--theme-on-glow`, `--theme-bulb-tint`) carry the dimness through.

`mixedRingOverride`: not needed for the white presets — `MIXED_DEFAULT` (purple) reads fine against all four white-tinted backgrounds.

---

## 3. Wire-protocol decision: native `ct` (mirek)

**Recommendation: send Hue native `ct` (mirek), not derived `xy`.** Reasons:
- Color-temperature-only bulbs (Hue White Ambiance) accept *only* `ct`, not `xy`. With the `xy` approximation, those bulbs wouldn't change CCT at all.
- The bridge applies CCT more accurately and stably from `ct` than from a CCT→xy approximation that we'd have to write ourselves.
- It's a one-line type widening; client signature stays trivial.

### Hue client extension

`nextjs-ui/lib/server/hue/client.ts` line 188 — widen the `body` type:

```ts
body: { on?: boolean; bri?: number; xy?: [number, number]; ct?: number }
```

No other changes to the client. The Hue v1 REST API accepts `ct` in the same `PUT /lights/{id}/state` call.

For full-color bulbs (capability `color: true` but not `colorTemp`): also supported by `ct` on Extended-color-light models. Hue accepts `ct` and the bridge converts internally. Our `lightCapabilities()` (client.ts:249-256) marks Extended color lights as `colorTemp: true`, so this is consistent — they will get `ct`.

For an `Extended color light` member that for some reason rejects `ct`, we have a defence-in-depth fallback: also send `xy` derived from the white-tinted `bulbPalette[0]` *only* if `colorTemp` is false but `color` is true. In practice all Hue full-color bulbs accept `ct`, so this fallback is never hit; it's there for forward-compat and for non-Hue color bulbs if the codebase ever grows them.

---

## 4. Fan-out path for white presets

`nextjs-ui/lib/server/light-groups.ts:37-103` — modify `fanOutLightCommand`:

1. At the top, derive `whitePreset = themeForColors ? whitePresetPayload(themeForColors) : null`.
2. When `whitePreset` is non-null AND `body.brightness === undefined`: override `briScaled` to `Math.round((whitePreset.brightness / 100) * 254)`. (If the caller explicitly set `body.brightness`, respect it — that's the case where the user is dragging the brightness slider on a tile that has the preset already applied.)
3. Per-member payload assembly (replaces the `if (palette && wantsOn && supportsColor)` branch at lines 58-61):

```ts
if (whitePreset) {
  if (caps?.colorTemp) {
    payload.ct = whitePreset.mirek
  } else if (supportsColor) {
    // Defensive fallback: full-color bulb without colorTemp capability flag.
    payload.xy = hexToXy(theme.bulbPalette[0]!)
  }
  // dimmable-only or onoff bulbs: no color/ct write — bri+on already covered above.
} else if (palette && wantsOn && supportsColor) {
  // existing palette branch unchanged
  const hex = paletteColorFor(palette, idx)
  payload.xy = hexToXy(hex)
}
```

4. Persist `theme` in `hue_light_state`: extend the upsert at lines 71-86 to write the theme key. See §7.

### Routing from each endpoint

- **Group state** (`app/api/light-groups/[id]/state/route.ts:46-47`): already passes `resolveLightTheme(themeOverride ?? group.theme)` to `fanOutLightCommand`. No change. The new branch in fan-out reads `theme.bulbOutput` and acts.
- **Single light state** (`app/api/integrations/hue/lights/[id]/state/route.ts`): the existing handler builds a `huePayload` inline. Replace the `body.theme` block at lines 47-53 with a small switch on `theme.bulbOutput.kind`:
  - `'palette'` (existing): `huePayload.xy = hexToXy(paletteColorFor(theme, 0))` if `supportsColor`.
  - `'white'`: `huePayload.ct = theme.bulbOutput.mirek` if `colorTemp` (read from the JSON-parsed `caps`); otherwise fallback to `xy = hexToXy(theme.bulbPalette[0])` if `color`. Also `huePayload.bri = Math.round((theme.bulbOutput.brightness/100) * 254)` if `caps.brightness` AND `body.brightness === undefined`. Set `huePayload.on = true` if `body.on === undefined` (mirrors existing color-theme behaviour on line 51).
- **Master state** (`app/api/lights/master-state/route.ts`): `POST` body is `{ on }` only; no theme on the master endpoint, so no change. The master endpoint fans `{ on: body.on }` out without a theme — meaning when the user master-toggles ON after a Nightlight was applied, the bridge's stored `ct`+`bri` (from when Nightlight was applied) are what come back on. See §9 for the implications.

---

## 5. Picker UI changes

### Sectioned `Listbox`

Catalyst's `Listbox` (the wrapper in `nextjs-ui/app/components/listbox.tsx`) is built on Headless UI. Look up whether it exposes `<ListboxSection>` / `<ListboxHeading>`; if it does (Catalyst commonly does for Sidebar / Dropdown), use those. If not, render headings inline as non-interactive `<div role="presentation">` rows with `text-[0.6rem] uppercase tracking-wider text-subtle` between option groups — the same typography Warren already uses for subtle category labels (e.g. `light-group-tile.tsx:265` "uppercase tracking-wider").

Concrete shape (after rewrite of `light-theme-picker.tsx`):

```tsx
const WHITE_KEYS: LightThemeKey[] = ['warmLight', 'everyday', 'readingLight', 'nightlight']
const COLOR_KEYS = (Object.keys(LIGHT_THEMES) as LightThemeKey[])
  .filter(k => !WHITE_KEYS.includes(k))

<Listbox value={value} onChange={onChange} aria-label={...}>
  <SectionHeading>Whites</SectionHeading>
  {WHITE_KEYS.map(k => <WhitePresetOption theme={LIGHT_THEMES[k]} />)}
  <SectionHeading>Colors</SectionHeading>
  {COLOR_KEYS.map(k => <ColorThemeOption theme={LIGHT_THEMES[k]} />)}
</Listbox>
```

`SectionHeading` is a small local component:

```tsx
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div role="presentation"
         className="px-2 pt-2 pb-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-subtle select-none">
      {children}
    </div>
  )
}
```

Order: Whites first (spec), Colors second.

### Swatch rendering for whites

For the four whites, the right-hand "palette dots" cluster from `light-theme-picker.tsx:27-31` doesn't make sense (a row of four near-identical near-whites reads as nothing). Replace the right-side cluster, *for white presets only*, with a small labeled CCT chip:

```tsx
{theme.bulbOutput.kind === 'white' ? (
  <span className="ml-auto inline-flex items-center gap-1.5 text-[0.65rem] text-subtle">
    <span aria-hidden
      className="size-3 rounded-full ring-1 ring-white/15"
      style={{ background: theme.swatch }} />
    {Math.round(1_000_000 / theme.bulbOutput.mirek)}K · {theme.bulbOutput.brightness}%
  </span>
) : (
  /* existing palette dots */
)}
```

This makes it instantly readable: "2700K · 60%" for Warm, "2200K · 10%" for Nightlight. The Nightlight row's `10%` column is the explicit visual cue that it is dim.

For the left-side big swatch (`size-4 rounded-full`), use `theme.swatch` for both kinds — it already conveys the temperature for whites.

### "Whites first" ordering in the type

`LightThemeKey` union order doesn't matter at runtime. The picker imposes the order (Whites array first). The default group theme for new groups (`room-card.tsx:178` hardcodes `'slate'`) stays as is — spec is explicit that we don't migrate existing rows.

---

## 6. Tile chrome

The existing chrome system in `light-group-tile.tsx:65-72` and the bulb-icon code at lines 244-258 reads exclusively from CSS variables (`--theme-on-border`, `--theme-on-glow`, `--theme-bulb-tint`, `--theme-on-bg`, `--theme-mixed-ring`). Whites supply different *values* for those variables — no new variables, no new branches.

The one place that does break for whites is the bulb-cluster background gradient at lines 230-234:

```ts
isOn && displayState !== 'mixed' && theme.bulbPalette.length > 0
  ? { background: `linear-gradient(135deg, ${theme.bulbPalette.join(', ')})` }
  : undefined
```

For whites, `bulbPalette` is set to three near-white tints derived from CCT (see §2 catalog), so the gradient still renders — and visibly conveys warmth/coolness. Nothing to change in the tile.

The inline palette signature at `light-group-tile.tsx:267-274` (`<span style={{ background: c }}>` per palette color) similarly renders three near-white pips for white presets — readable as "this is a white-toned theme".

`hue-light-tile.tsx` currently has no theme awareness — its bulb background is the user's `colorOverride` (line 244-247). To make per-light tile chrome reflect the chosen preset, the tile needs `sensor.lightTheme` (see §7) and should:

- When `sensor.lightTheme` is set AND the resolved theme `bulbOutput.kind === 'white'`: paint the bulb-icon background with `theme.bulbPalette[0]` (the brightest of the three near-white tints) using the same boxShadow technique as line 245.
- When `sensor.lightTheme` is set AND `bulbOutput.kind === 'palette'`: do nothing new — `colorOverride` stays the source of truth (user-picked hex from palette).

No new chrome primitives needed; "dim Nightlight" is achieved entirely via the lower glow/tint alphas in the catalog.

---

## 7. Per-light persistence (the missing piece)

**Today there is NO per-light theme column.** The single-light POST handler at `app/api/integrations/hue/lights/[id]/state/route.ts:71-88` writes only `on_state` and `brightness` to `hue_light_state`. The spec's acceptance criterion *"chosen preset persists across a page reload and a server restart"* therefore cannot be satisfied without adding a column.

### Schema migration in `initDb()`

Add to `nextjs-ui/lib/server/db.ts` after the existing migration block (after line 172):

```ts
const hlsCols = db.pragma('table_info(hue_light_state)') as { name: string }[]
if (!hlsCols.some(c => c.name === 'theme')) {
  db.exec('ALTER TABLE hue_light_state ADD COLUMN theme TEXT')
}
```

Adding a NULL-allowed `TEXT` column to SQLite via `ALTER TABLE` is a fast, in-place operation — no shadow table needed (the existing `light_groups.theme` migration at line 169-172 used the same pattern).

### Wire it into `SensorView`

`nextjs-ui/lib/shared/types.ts:11-32` — add `lightTheme?: LightThemeKey | null`.

The rooms aggregation that builds `SensorView`s (find via `grep` — likely `lib/server/rooms.ts` or similar; the planning doc lists known endpoints but I haven't read the rooms aggregator) needs to `LEFT JOIN hue_light_state hls ON hls.device_id = s.device_id` and surface `hls.theme` as `lightTheme`. The single-light POST already writes to `hue_light_state` via UPSERT (lines 73-88), so we just extend the UPSERT to set `theme = ?` when the request includes a theme.

### Single-light POST persistence

`app/api/integrations/hue/lights/[id]/state/route.ts:71-88` — extend the UPSERT to include `theme`:

```sql
INSERT INTO hue_light_state (device_id, on_state, brightness, reachable, theme, updated_at)
VALUES (?, COALESCE(?, 0), ?, 1, ?, ?)
ON CONFLICT(device_id) DO UPDATE SET
  on_state   = COALESCE(?, on_state),
  brightness = COALESCE(?, brightness),
  theme      = COALESCE(?, theme),
  updated_at = ?
```

Bind `body.theme ?? null` for the new param. `COALESCE(?, theme)` means "only overwrite if the request supplied a theme" — so a brightness-only request doesn't blow away the previously-applied theme.

### Group fan-out persistence

`light-groups.ts:71-86` — same extension. Pass `theme.key` (the resolved theme key from the caller) into the UPSERT so every member's `hue_light_state.theme` gets the active group theme stamped onto it. This means the per-light tile chrome reflects the group-level preset even though there's no per-light request.

This stamping is intentional — when a group is set to Reading Light, every member's tile should look like Reading Light. If the user later changes a single light to a different theme via the single-light editor, the per-light row wins (it overwrites `hue_light_state.theme` for that one device).

---

## 8. Poller respect

`nextjs-ui/lib/server/hue/runtime.ts:81-95` — the `upsertLight` UPSERT writes `on_state`, `brightness`, `reachable`, `updated_at`. It does **not** touch `theme`. Confirmed safe: the new `theme` column is never written by the poller.

There IS a subtle issue though: the poller's UPSERT at lines 84-95 unconditionally overwrites `brightness` with whatever the bridge reports. So when Nightlight is applied (brightness=10), the bridge confirms bri≈25 (10% of 254), the next poll reads 25 back, and the dashboard shows 10% — fine. But if a *different process* (Hue app on the user's phone) pushes the brightness to 80% on the same bulb, the next poll will overwrite our cached 25 with ~204 — the UI will show 80% even though `hue_light_state.theme === 'nightlight'`. That's correct: the *theme* persists (sticky tile chrome), but the *brightness* tracks reality. Spec acceptance criterion *"poller does not overwrite a freshly-applied preset"* is satisfied because the *theme key* doesn't change; brightness drift is an external-mutation case the spec doesn't forbid.

No code change to the poller.

---

## 9. Edge cases

| Scenario | Behaviour |
|---|---|
| **Onoff-only bulb** (no brightness, no color, no CT) | `fanOutLightCommand` builds a payload of just `{ on: true }`. `theme` is still persisted in `hue_light_state.theme` so tile chrome reflects the preset. (Acceptance criterion explicitly allows this.) |
| **Dimmable-only bulb** (brightness, no color, no CT) | Payload is `{ on: true, bri: <preset bri scaled> }`. Brightness target *is* written. Theme persisted, chrome reflects the preset. (Acceptance criterion explicit.) |
| **Color-temp-only bulb** (CT + brightness, no color) | Payload is `{ on, bri, ct }`. Native and ideal. |
| **Color bulb without CT** (rare; non-Hue bulbs adapted later) | Falls through the defensive `xy = hexToXy(bulbPalette[0])` branch — the brightest near-white tint, which is close to white-at-CCT. |
| **Color or CT but no brightness** (very rare) | Brightness write skipped; `ct` written; theme persisted. (Acceptance criterion explicit.) |
| **Mixed group (some color, some dimmable, some onoff)** | Each member's payload is computed from its own `capabilities` JSON in `fanOutLightCommand`. Color members get `ct`; dimmable get `bri`-only; onoff get `on` only. Per-member partial-failure reporting unchanged. |
| **Master switch toggles all rooms ON after Nightlight was last applied to one bedroom** | The master `POST /api/lights/master-state` only sends `{ on: true }` per member. The bridge restores each bulb to its last-known state, which for the bedroom is Nightlight (10% + 2200K, because that's what we last sent). Tile chrome correctly shows Nightlight because `hue_light_state.theme` persisted from the previous apply, and the brightness column was NOT overwritten by the master `{on:true}` call (the fan-out only writes `bri` when `body.brightness !== undefined`). |
| **Nightlight selected, master-off, master-on** | Same as above. Bridge state is intact across the off/on cycle, our `hue_light_state.theme` was untouched, so the bedroom comes back on as Nightlight. |
| **User drags brightness slider on a Nightlight tile** | Single-light POST sends `{ brightness }` without a theme. Server payload includes `bri` only; `theme` column is *not* updated (COALESCE preserves it). Tile chrome stays Nightlight; brightness is what the user dragged to. This matches the spec: "users still adjust brightness freely via the existing per-light slider after the preset has been applied." |
| **User picks a custom hex color from EditLightModal on a light that had Nightlight applied** | Existing path: POST `{ on:true, color:'#abcdef' }`. Server now needs to clear `theme` when a `color` is set without a `theme` — otherwise the persisted theme key contradicts the displayed color. Plan: when `body.color !== undefined && body.theme === undefined`, the UPSERT writes `theme = NULL` (literal null bind, not COALESCE) so the next page load shows the default tile chrome. |
| **Unknown theme key submitted** | Caught by `isValidLightThemeKey` (shared) and `validateGroupTheme` (server) — already a hard 400. Adding new keys to the union strengthens this rather than loosens it. |

---

## 10. Test plan

Existing E2E to extend: `nextjs-ui/tests/e2e/light-group.spec.ts`. Existing tests at lines 8-14, 17-27, 29-33, 35-100 keep passing as-is — adding new keys to the union does not break the "unknown key 400" test (line 17-27) because `'warm-amber'` is still unknown.

### New API-level test cases

In `light-group.spec.ts`:

1. **PATCH accepts each new white preset key**: parameterize over `['warmLight', 'everyday', 'readingLight', 'nightlight']` and assert PATCH returns ok (or 404 on the phantom-id case). Mirror the existing line 8-14 test.
2. **POST `/api/integrations/hue/lights/[id]/state` with `theme: 'nightlight'`** → returns `{ ok: true }`, `hue_light_state.theme === 'nightlight'` after the call (verify via reading `/api/rooms/.../sensors` and asserting `lightTheme === 'nightlight'`).
3. **POST `/api/light-groups/[id]/state` with `theme: 'readingLight'`** → returns success summary, every member's `lightTheme` becomes `'readingLight'`.
4. **Persistence across reload**: apply `'warmLight'` to a light, refetch the rooms payload, assert `lightTheme === 'warmLight'`. (Server-restart variant is harder in Playwright; reload-only is sufficient evidence given the SQLite write is synchronous.)
5. **Brightness pin-on-apply**: apply `'nightlight'` to a dimmable light, then immediately fetch state — `hue_light_state.brightness ≈ 25` (10% of 254). Apply `'everyday'` — brightness ≈ 254.
6. **Capability fallbacks**: in `HUE_FAKE` mode, the fake fixture has both an `Extended color light` (id 1) and a `Dimmable light` (id 2). Apply `'readingLight'` to a 2-member group containing both; assert success for both, assert dimmable member's brightness was written (cached value reflects 100%) and the color member also got the apply (no error).
7. **Theme cleared by custom color pick**: apply `'warmLight'`, then POST `{ on: true, color: '#ff0000' }`, assert `lightTheme === null` afterwards.

### New UI-level test cases

In `light-group.spec.ts` (extend the existing browser block at lines 35-100):

8. **Picker has "Whites" and "Colors" headings**: open detail dialog, open picker, assert two `text=Whites` and `text=Colors` heading elements visible (case-insensitive).
9. **Whites are listed first**: assert the first `role="option"` in the open Listbox is "Warm Light" (or whichever order we settle on).
10. **Selecting a white preset round-trips to the bridge**: pick "Reading Light", wait for both PATCH (to `/api/light-groups/[id]`) and POST (to `/api/light-groups/[id]/state`), assert both 2xx. Assert the picker button's label updates to "Reading Light".
11. **Tile chrome reflects whites**: after selecting Reading Light, the group-tile bulb-cluster `<button>` should have a `style.background` substring containing one of the three near-white tints (`#dce8ff` / `#eaf2ff` / `#ffffff`). No need to assert exact pixel rendering.
12. **Nightlight reads dim**: assert that the computed `--theme-on-glow` CSS variable on a Nightlight tile is the lower-alpha value (e.g. contains `0.18`), differentiating it from Warm Light's `0.45`.

### Existing test that needs no change
- `light-group.spec.ts:17-27` (unknown theme key) — `'warm-amber'` is still unknown.

### Optional new test file
A focused `nextjs-ui/tests/e2e/light-themes.spec.ts` for the API-level matrix (cases 1–7) keeps `light-group.spec.ts` from ballooning. Worth adding if total cases > 8 in that file.

---

## 11. Sequencing

Three independently-mergeable slices, in order:

### Slice A — Catalog + types (foundation, no behaviour change yet)
- `lib/shared/light-themes.ts`: add union members, `BulbOutput` discriminator, four entries, `whitePresetPayload()` helper.
- `lib/shared/types.ts`: add `lightTheme?: LightThemeKey | null` to `SensorView`.
- `lib/server/db.ts`: add `theme` column migration to `hue_light_state`.
- `lib/server/hue/client.ts`: widen `setLightState` body type to include `ct`.

This slice can land alone — the new keys exist, the column exists, but nothing yet writes them. CI passes.

### Slice B — Server fan-out + persistence
- `lib/server/light-groups.ts`: `fanOutLightCommand` learns about white presets, persists `theme`.
- `app/api/integrations/hue/lights/[id]/state/route.ts`: handles white preset apply, persists `theme`, clears `theme` on custom color.
- Rooms aggregation file (locate via `grep`): surfaces `hls.theme` as `lightTheme`.

Must land **together**. After this slice, the server fully supports the four presets via API; UI hasn't caught up yet but `light-group.spec.ts` API tests can be written and pass.

### Slice C — UI
- `app/components/warren/light-theme-picker.tsx`: sectioned listbox.
- `app/components/warren/light-group-detail-modal.tsx`: relabel "Theme".
- `app/components/warren/edit-light-modal.tsx`: add the picker for single lights.
- `app/components/warren/hue-light-tile.tsx`: read `sensor.lightTheme` for tile chrome.

Can land in one PR after Slice B, or split: detail-modal/picker first, single-light picker second.

The poller and master-state endpoint require **no change** — they're correct as-is by virtue of the per-column persistence design.

---

## Critical Files

- [`nextjs-ui/lib/shared/light-themes.ts`](../nextjs-ui/lib/shared/light-themes.ts)
- [`nextjs-ui/lib/server/light-groups.ts`](../nextjs-ui/lib/server/light-groups.ts)
- [`nextjs-ui/app/api/integrations/hue/lights/[id]/state/route.ts`](../nextjs-ui/app/api/integrations/hue/lights/[id]/state/route.ts)
- [`nextjs-ui/lib/server/db.ts`](../nextjs-ui/lib/server/db.ts)
- [`nextjs-ui/app/components/warren/light-theme-picker.tsx`](../nextjs-ui/app/components/warren/light-theme-picker.tsx)
