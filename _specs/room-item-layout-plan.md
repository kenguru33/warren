# Implementation Plan: Better Room Item Layout

Companion plan for [`room-item-layout.md`](room-item-layout.md). Focused on the refactor of `ui/app/components/RoomCard.vue` and the tile component family that surrounds it. Implementation has not started — this is the plan only.

## 1. Decomposition: extract climate, motion, camera tiles

Recommendation: create three new components — `ClimateTile.vue` (handles temperature and humidity via a `variant` prop), `MotionTile.vue`, `CameraTile.vue`.

Justifications:

- `HueLightTile` and `LightGroupTile` are already extracted. Leaving climate/motion/camera inline preserves an asymmetry that is the proximate cause of `RoomCard.vue` being ~850 lines and mixing five tile concerns with section orchestration. The refactor doubles down on sections — that orchestration code should not have to coexist with five inline tile templates plus their actions and offline-state markup.
- Inline tiles already duplicate `tile-actions` / `tile-action-btn` markup four times. Extracting collapses that duplication into one place per type.
- The new layout demands distinct tile shapes (square climate, wide camera, square motion, smaller light chip). Per-component scoped CSS expresses that without bloating `RoomCard.vue`'s style block further.
- The existing `CameraCard.vue` is shaped for a standalone full-card layout (its own border, 16/9 ratio, separate footer). Not the right fit for an in-room tile — leave it untouched and create a new `CameraTile.vue` that mirrors the in-room camera tile semantics.
- Climate-temp vs. climate-hum share an identical structure (icon, value, label, optional custom label, target+deviation, offline badge, edit-mode actions). One `ClimateTile.vue` with `variant: 'temperature' | 'humidity'` beats two near-duplicates.

## 2. Layout strategy: container queries on the room card

Use **CSS container queries** (`container-type: inline-size` on `.room-card`) plus per-section CSS Grid. Container queries are the right primitive because the parent room grid in `pages/index.vue` puts a variable number of room cards per row depending on viewport — the same viewport width can yield a wide single-column card or a narrow two-up card. Media queries cannot distinguish those.

Per-section approach:

- **Ambient strip** (climate + motion): CSS Grid with `grid-template-columns: repeat(auto-fit, minmax(--ambient-min, 1fr))`, with `--ambient-min` tuned via container query breakpoints. Reflow vs. fixed three-up is a spec-open design decision — defer the choice but build with `auto-fit` so it can be swapped to `repeat(3, 1fr)` cheaply.
- **Camera area**: `grid-template-columns: 1fr` (single full-width tile) at narrow card widths; `repeat(auto-fit, minmax(--cam-min, 1fr))` at wider widths so multiple cameras can sit side-by-side. Each camera tile uses `aspect-ratio: 16/9`. Multi-camera layout is a spec-open decision; `auto-fit` answers "wrap" by default — flag for confirmation.
- **Lighting area**: nested layout. Light groups in a grid like the ambient strip but with a wider `minmax` (medium tiles). Individual lights below the groups in a denser grid using `repeat(auto-fill, minmax(--light-chip-min, 1fr))`. `auto-fill` over `auto-fit` because we want chips to keep their compact width rather than expanding to fill the row when there are few lights — three 250px-wide chips read worse than three 120px chips with whitespace.
- **Container query breakpoints**: pick two — e.g. `@container (min-width: 360px)` for "narrow card" and `@container (min-width: 560px)` for "wide card". Tune empirically against the actual room grid.

Why not flex wrap: cannot enforce equal column widths cleanly when row content differs in size, and `flex-basis` math becomes a manual replica of `minmax()`. Why not media queries: parent grid breaks the viewport-width assumption. Why not subgrid: each section has a different column rhythm (3 ambient, N cameras, M groups, K chips), so subgrid offers no benefit; independent grids per section are simpler.

## 3. File-by-file change list

### New files in `app/components/`

- **`ClimateTile.vue`** — props `{ sensor, reference, variant: 'temperature' | 'humidity', editing, isOffline }`; emits `view-history`, `edit-sensor`, `remove-sensor`. Wraps the temperature/humidity tile bodies currently inline at `RoomCard.vue:180–232` plus the relay indicators (only for `variant === 'temperature'`). Owns its own `ConfirmDialog` for remove confirmation, mirroring `HueLightTile.vue:119–125`.
- **`MotionTile.vue`** — props `{ sensor, editing, isOffline, recentMotion, motionLabel }`; emits `view-history`, `edit-sensor`, `remove-sensor`. Wraps `RoomCard.vue:283–305`. Receives derived `recentMotion` and `motionLabel` from parent (the `now` ticker lives in `RoomCard.vue`, so passing in is simpler).
- **`CameraTile.vue`** — props `{ sensor, editing, recentMotion }`; emits `open-live`, `edit-sensor`, `remove-sensor`. Wraps `RoomCard.vue:234–259`. Distinct from `CameraCard.vue` (which is a standalone card with header, footer, 16/9). The new tile uses `aspect-ratio` plus the existing overlay/badge/floor-label affordances.

Open: extract relay indicators into `RelayIndicators.vue`? Probably no — only used in the temperature climate tile.

### Edited files

- **`app/components/RoomCard.vue`**:
  - Strip the inline temperature/humidity/camera/motion templates (lines 180–305) and replace with new component instantiations inside section wrappers.
  - Replace the single `.sensor-grid` wrapper with `.ambient-strip`, `.camera-area`, `.lighting-area > (.light-groups + .light-chips)`.
  - Drop the central `confirmSensor` ref and its `<ConfirmDialog>`; each new tile component owns its own confirm dialog (matches the existing `HueLightTile`/`LightGroupTile` pattern).
  - Add `container-type: inline-size` to `.room-card` and replace `.sensor-grid` styles with section-by-section grids per §2.
  - Move climate/motion/camera-tile styles out (they migrate to the new components). Keep card chrome, header, edit panel, group panel, slide transition, master toggle wrapper styles.
  - All `<script setup>` derived state (`tempSensor`, `humSensor`, `motionSensor`, `cameras`, `lights`, `ungroupedLights`, `lightGroups`, `lightsById`, `recentMotion`, `motionLabel`, `isOffline`, `tempDev`, `humDev`) stays — these become props to the new tiles.
  - Both `<Transition name="slide">` blocks unchanged in markup; just verify the `slide` keyframe still works against the new section structure.
- **`app/components/HueLightTile.vue`**:
  - Redesign to a smaller chip form factor: reduce `min-height: 160px` → ~96–110px, simplify layout (icon + name + on/off + tiny brightness), tighten paddings.
  - Verify tile-action button hit targets remain reachable on the smaller chip (flag for visual review).
  - Optionally hide the `tile-label` "Light" text and rely on the icon (open design decision).
- **`app/components/LightGroupTile.vue`**:
  - Remove the `grid-column: span 2` rule (line 176) — the new lighting area uses `auto-fit` and groups will naturally take their assigned column width.
  - Otherwise unchanged.

### Files NOT modified

- `app/pages/index.vue` — emits and props on `<RoomCard>` are unchanged.
- `app/components/MasterLightToggle.vue` — unchanged; keeps current placement in header.
- `app/components/CameraCard.vue` — explicitly left as-is.
- `SensorHistoryModal.vue`, `LiveStreamModal.vue`, `SensorConfigModal.vue`, `AddSensorModal.vue`, `LightGroupModal.vue`, `ConfirmDialog.vue` — unchanged.
- `shared/types.ts`, `app/composables/`, `server/` — unchanged.

## 4. Sequencing

Each step keeps the dashboard functional between commits.

1. **Extract `ClimateTile.vue`**. Replace temp+hum inline blocks in `RoomCard.vue` with two `<ClimateTile variant="...">` instances inside the existing `.sensor-grid`. No layout change yet.
2. **Extract `MotionTile.vue`**. Replace inline motion block.
3. **Extract `CameraTile.vue`**. Replace inline camera block.

   At this point `RoomCard.vue` template is composed of child components in one grid; behavior is identical to before extraction.

4. **Restructure into sections**. Replace the single `.sensor-grid` with `.ambient-strip` + `.camera-area` + `.lighting-area > (.light-groups + .light-chips)`. Drop `LightGroupTile`'s `grid-column: span 2`. Use temporary placeholder grids (`repeat(2, 1fr)`) to keep the visual change minimal.
5. **Restyle for new tile shapes**. Add `container-type: inline-size` to `.room-card`. Implement section grids per §2 with their `auto-fit`/`auto-fill` rules and container-query breakpoints. Restyle `HueLightTile.vue` to the chip form factor. Tune `--ambient-min`, `--cam-min`, `--light-chip-min` against real rooms.
6. **Polish**: section dividers (open design decision), edit-mode affordances on small chips, camera tile aspect ratio against snapshot images.

The order matters: extractions first (zero behavioral change), then sectioning (visible structure, same look), then restyling (visible new look). Each step is independently revertable.

## 5. Risks and edge cases

- **Empty or sparse rooms**:
  - 0 sensors and 0 light groups: render no sections at all, preserving the current empty-card-body behavior at `RoomCard.vue:178`.
  - 1 sensor (e.g. only temperature): the ambient strip with one tile spanning `1fr` will look stretched. Spec acceptance requires it not look half-empty. Either constrain max-width on lone ambient tiles, or center single-item rows. Decide during implementation.
- **Lots of lights (8+)**: the `auto-fill, minmax(--light-chip-min, 1fr)` chip grid handles this. Verify chip min-height keeps row count low and that no horizontal scroll appears on narrow card widths.
- **Multiple cameras**: `auto-fit minmax` wraps by default; if the design wants stacked-only, swap to `1fr`. Spec-open.
- **Offline sensors**: every tile preserves its existing `tile-offline` styling. After extraction, each tile component's scoped CSS owns the rule — verify visually on each new component independently.
- **Edit-mode reachability on small chips**: `HueLightTile` chips at ~110px wide with two ~24px buttons in the top-right is tight but workable. Consider promoting actions to a hover overlay or kebab. Flag for visual review.
- **Master toggle visual coupling**: spec-open. Keep decoupled in this refactor.
- **`Transition name="slide"`**: animates `max-height` 0→500px. Both transitions remain siblings of the card body, not nested in new sections, so should keep working. Verify `.group-panel` and `.edit-panel` mount/unmount on `editing` toggle. The 500px cap should still be enough for the unchanged target sliders.
- **Lights-only rooms**: spec-open. Container queries on `.room-card` mean the lighting area will inherit full card width — confirm visually.
- **Confirm-dialog ownership change**: moving sensor-remove confirms from `RoomCard` (lines 374–380) into each tile means a tile that emits `remove-sensor` does so post-confirmation. Update `RoomCard.vue` to remove `confirmSensor` ref and the central `<ConfirmDialog>`, and emit through directly. Light/group tiles already do this — symmetric.
- **Container query browser support**: not a real risk — supported in all evergreen browsers since 2022.

## 6. Explicitly NOT changing

- **Data model**: `SensorView`, `RoomWithSensors`, `LightGroupView`, `MasterState`, `RoomReference` in `shared/types.ts` — untouched.
- **API endpoints**: no changes to `/api/rooms/:id/lights-state`, `/api/integrations/hue/lights/:id/state`, `/api/light-groups/:id/state`, `/api/sensors/...`, `/api/rooms`. All `$fetch` calls in `RoomCard.vue` (master toggle), `HueLightTile.vue`, and `LightGroupTile.vue` stay identical.
- **Click handlers**: `view-history`, `open-live`, light toggle, group toggle, brightness commit — all preserved.
- **Emit signatures on `<RoomCard>`**: every entry in `defineEmits` (lines 6–19) stays identical so the `pages/index.vue` binding is untouched.
- **Parent `pages/index.vue`**: out of scope.
- **Header behavior**: `MasterLightToggle`, add-sensor / edit / delete buttons preserved verbatim.
- **Sensor history modal, live-stream modal, group modal**: unchanged.
- **Edit panel target sliders**: temperature/humidity target sliders' markup and `save-ref` emit preserved.
- **Group affordance**: `Group lights` button still appears in edit mode when there are at least 2 lights, in the same `.group-panel` slot, with the same `add-group` emit.
- **Slide transitions**: `slide-enter-active` / `slide-leave-active` rules untouched.

## 7. Verification (manual)

Spot-check rooms (set up via the UI or simulate via SQLite if needed):

1. **Full-loadout room**: temperature + humidity + motion + 1 camera + 2 light groups + 4 ungrouped lights. Verify section order: ambient (3 tiles), camera (1 tile), lighting (2 group tiles, then 4 chips). Verify climate tiles, motion, camera, group, chip sizes are visibly distinct.
2. **Climate-only room**: only a temperature sensor. Verify it does not look half-empty.
3. **Lights-heavy room**: 8 ungrouped Hue lights. Verify they pack into multiple compact rows; verify edit-mode buttons are reachable on each chip.
4. **Multi-camera room**: 2 cameras, no lights. Verify camera-area layout matches the design choice.
5. **Group + ungrouped mix**: 1 light group with 3 members, 2 ungrouped lights. Verify groups render before ungrouped lights inside the lighting area.
6. **Lights-only room**: no climate, no motion, no camera. Verify lighting area uses the full card. Verify `Group lights` button still appears in edit mode.

Resize tests:

7. Drag browser from 1920px wide to 360px wide. Verify (a) parent grid changes columns; (b) inside each room card, sections reflow without horizontal scroll, without clipped values, without overlapping tiles.
8. Force a single-column parent grid (one wide room) — verify sections expand and use the extra width (more chips per row, possibly side-by-side cameras).

Edit-mode flow:

9. Click edit (pencil) icon. Verify per-tile edit and remove buttons appear on every tile type.
10. Verify `Group lights` button appears when ungrouped lights ≥ 2; disappears when < 2.
11. Verify target temp / target humidity edit panel still slides in below when climate sensors are present and saves with the same emit.
12. Tap remove on a tile; verify the per-tile `ConfirmDialog` appears (now owned by the tile component).

Behavior preservation:

13. Click temp/hum/motion tile → sensor history modal opens.
14. Click camera tile → live stream modal opens.
15. Toggle a light from its chip → bulb actually responds; toggle a group from its tile → group responds.
16. Verify offline-state styling on a sensor whose `lastRecordedAt` is > 30s old.
17. Verify heater/fan relay indicators on the temperature tile when active.
18. Verify recent-motion accent on the motion tile when `lastMotion` < 5 min.
19. Verify camera "Motion" badge appears when `lastMotion` < 5 min.
20. Verify master toggle in header still works — including partial-failure badge and bridge-unreachable error.

## Open design decisions to confirm during implementation

- Ambient strip: fixed three-up vs. reflow.
- Multiple cameras: side-by-side, stacked, or wrap.
- Section dividers: spacing only, hairlines, or labeled.
- Master toggle visual coupling to lighting section.
- Lights-only room: full lighting area vs. visible "no ambient" hint.
- `HueLightTile.vue` chip: keep "Light" text label or rely on icon only.
- Edit-mode actions on small chips: top-right always-visible vs. hover overlay vs. kebab.

## CSS palette to keep consistent

`RoomCard.vue` and the existing tile components share a palette — preserve it across new tiles. The project does not use CSS custom properties for these; match the existing inline-literal convention in scoped styles rather than introducing a token file in this refactor.

- Card surface: `#1e2130`; tile surface: `#151825`; hover: `#1a2035`.
- Borders: `#2a2f45`; active border: `#4a6fa5`.
- Text: primary `#e2e8f0`; secondary `#94a3b8`; tertiary `#64748b`; quaternary `#475569`; quinternary `#334155`.
- Accent: `#a0c4ff`; brand: `#4a6fa5`.
- Status: error/heater `#f87171` / `#ef4444` / `#f97316`; under/cool `#34d399`; fan `#38bdf8`; group purple `rgba(168, 85, 247, 0.45)`; warn `#fbbf24`.
- Offline tint: `rgba(248, 113, 113, 0.06)` background, `rgba(248, 113, 113, 0.3)` outline.
- Tile radius: `10px`; card radius: `16px`.
- Slide transition: `max-height 0.25s ease, opacity 0.2s ease; max-height: 500px`.

## Critical files

- `ui/app/components/RoomCard.vue`
- `ui/app/components/HueLightTile.vue`
- `ui/app/components/LightGroupTile.vue`
- `ui/shared/types.ts`
- `_specs/room-item-layout.md`
