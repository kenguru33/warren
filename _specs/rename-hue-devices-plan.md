# Implementation Plan: Rename Hue Devices

This plan extends the existing Philips Hue integration so users can give Warren-side names to Hue lights and Hue sensors **and have those names pushed back to the Hue Bridge** so other Hue apps see the same name. It builds on the schema, poller, and discovery flow already established in `_specs/philips-hue-integration-plan.md`.

Source of truth for the rename is Warren — concretely a new column on `hue_devices`. The rename endpoint writes the name to the bridge first, then to the local DB, so the two stay consistent. The poller is also extended to reconcile: if a `display_name` exists and the bridge has drifted (e.g. user renamed in the Hue app), Warren re-pushes its name on the next cycle. `sensors.label` is treated as **legacy/deprecated for Hue-backed rows** — the existing `/api/sensors/[id].patch.ts` continues to work for ESP32 sensors only. A one-time migration copies any pre-existing labels from Hue-backed `sensors` rows into the new column.

> **Note:** This plan supersedes the spec's "Non-Goals" item that excluded pushing names back to the bridge. Rename is now bidirectional: Warren → Bridge on save, Bridge → Warren as fallback when no `display_name` is set.

---

## 1. Schema change

### Add `display_name` to `hue_devices` (`ui/server/utils/db.ts`)

`hue_devices` already exists (lines 116–129). Add one nullable column:

```sql
ALTER TABLE hue_devices ADD COLUMN display_name TEXT;
```

SQLite supports `ALTER TABLE ADD COLUMN` for nullable columns directly — no shadow-table dance is needed. Wrap it in a guard that checks `PRAGMA table_info(hue_devices)` before running, the same defensive pattern used elsewhere when columns are added in place.

Semantics:
- `hue_devices.name` — bridge-supplied name, refreshed by the poller every cycle (unchanged behavior).
- `hue_devices.display_name` — user-defined Warren name; `NULL` when the user has not set one or has cleared it.

### One-time migration of existing `sensors.label` values

At startup (in `initDb()` after the column is added, gated by a `meta` row e.g. `hue_rename_label_migrated`):

```sql
UPDATE hue_devices
   SET display_name = (
     SELECT s.label FROM sensors s
      WHERE s.device_id = hue_devices.device_id
        AND s.label IS NOT NULL
        AND TRIM(s.label) <> ''
   )
 WHERE display_name IS NULL
   AND device_id LIKE 'hue-%'
   AND EXISTS (
     SELECT 1 FROM sensors s
      WHERE s.device_id = hue_devices.device_id
        AND s.label IS NOT NULL
        AND TRIM(s.label) <> ''
   );

UPDATE sensors
   SET label = NULL
 WHERE device_id LIKE 'hue-%'
   AND label IS NOT NULL;
```

Why null out `sensors.label` for Hue rows: it eliminates the dual source of truth and prevents any future ESP32-style label-edit flow from accidentally writing to Hue rows. The migration is idempotent because the `meta` sentinel row gates it.

### No new indexes
`device_id` is already `UNIQUE`. `display_name` is read alongside `name` on rows already keyed by `device_id`, so no separate index is needed.

---

## 2. Display-name resolution helper

Add a tiny pure helper, e.g. in `ui/server/utils/hue.ts` or a new `ui/server/utils/hue-name.ts`:

```ts
export function resolveHueName(
  displayName: string | null | undefined,
  bridgeName: string | null | undefined,
  deviceId: string
): string {
  const dn = displayName?.trim()
  if (dn) return dn
  const bn = bridgeName?.trim()
  if (bn) return bn
  return deviceId
}
```

Resolution order matches the spec: user-defined → bridge → stable identifier. Used by every API route that surfaces a Hue device (see §4). Handlers also expose `bridgeName` (raw `hue_devices.name`) and, where useful, `displayName` (raw `hue_devices.display_name`) so the UI can render the bridge name as a hint.

---

## 3. Hue Bridge name-push helpers

Extend `ui/server/utils/hue.ts` with two new helpers, mirroring the shape of the existing `setLightState`:

```ts
export async function setLightName(
  ip: string, key: string, hueResourceId: string, name: string,
): Promise<void>

export async function setSensorName(
  ip: string, key: string, hueResourceId: string, name: string,
): Promise<void>
```

Endpoints (Hue v1):
- `PUT http://{ip}/api/{key}/lights/{id}` with body `{"name": "..."}`
- `PUT http://{ip}/api/{key}/sensors/{id}` with body `{"name": "..."}`

Both reuse the existing error mapping: `HueUnreachableError` on network/HTTP failure, `HueUnauthorizedError` if Hue returns the unauthorized error wrapper, `HueUnreachableError` for any other Hue error object. Honor `FAKE` mode (no-op return) for parity with `setLightState`.

**Hue v1 length limit is 32 characters.** This is enforced by the bridge — exceeding it returns a Hue error 7 (`invalid value`). To keep both sides identical, Warren caps at **32 characters** (overriding the spec's "e.g. 60" suggestion). The 32-char limit is shared by `name.patch.ts` validation and the modal `maxlength` attribute.

## 4. Poller — never overwrite `display_name`, and reconcile drift back to the bridge

In `ui/server/utils/hue-runtime.ts`, `upsertLight()` and `upsertSensor()` already write only `name`, `last_seen`, etc. — `display_name` is not in the upsert column list, so it is preserved automatically. Add a one-line comment at each upsert site noting this invariant so it survives future edits:

```ts
// display_name is user-controlled — never include it in poller upserts.
```

**New: bridge reconciliation step.** After the upsert, if the row has a non-null `display_name` and the bridge-reported name differs, push `display_name` back to the bridge. This handles the case where the user renamed the device in the Hue app while a Warren name was set — Warren remains authoritative.

Sketch (per device, after the upsert):

```ts
const row = db.prepare(
  'SELECT display_name, name, kind, hue_resource_id FROM hue_devices WHERE device_id = ?',
).get(deviceId) as { display_name: string | null; name: string; kind: 'light'|'sensor'; hue_resource_id: string }

if (row.display_name && row.display_name !== row.name) {
  try {
    if (row.kind === 'light') await setLightName(ip, key, row.hue_resource_id, row.display_name)
    else                       await setSensorName(ip, key, row.hue_resource_id, row.display_name)
    // Update local cache so next poll doesn't re-detect drift before the bridge has propagated.
    db.prepare('UPDATE hue_devices SET name = ? WHERE device_id = ?').run(row.display_name, deviceId)
  } catch (e) {
    // Best-effort: log and move on. The next poll cycle retries.
    console.warn('[hue] reconcile rename failed', deviceId, e)
  }
}
```

Reconciliation runs inside the same per-device pass as the upsert, so it adds at most one extra HTTP PUT per renamed device per cycle, and only when there is actual drift.

If a Hue device is removed from the bridge and reappears later with the same `device_id`, the row was never deleted (only `available` flipped to 0), so `display_name` is preserved automatically and the next reconcile push restores the name on the bridge. If the bridge is fully disconnected (`DELETE /api/integrations/hue`), `hue_devices` is wiped, clearing `display_name` — matching the spec.

---

## 5. API changes

### 5.1 New endpoint: rename a Hue device (writes through to the bridge)

`ui/server/api/integrations/hue/devices/[deviceId]/name.patch.ts`

- Method: `PATCH`
- Body: `{ name: string | null }`
- Behavior:
  1. Look up the row by `device_id`. `404 { code: 'unknown_device' }` if missing.
  2. Trim the input.
  3. **Set path** (non-empty `name`):
     - Validate `1 <= length <= 32`. Reject longer with `400 { code: 'name_too_long', max: 32 }`.
     - Look up the bridge row; if absent, `409 { code: 'bridge_not_paired' }`.
     - Call `setLightName` or `setSensorName` (per `kind`) against the bridge.
     - On `HueUnreachableError`: `503 { code: 'bridge_unreachable' }` — **do not save locally**.
     - On `HueUnauthorizedError`: `401 { code: 'bridge_unauthorized' }` — **do not save locally**.
     - On success: `UPDATE hue_devices SET display_name = ?, name = ? WHERE device_id = ?` (mirror the new value into `name` so the next poll doesn't briefly disagree).
  4. **Clear path** (empty/null/whitespace `name`):
     - Set `display_name = NULL` locally. **Do not push anything to the bridge** — clearing means "stop overriding the bridge name", not "rename the bridge". The current bridge name (whatever it is) becomes the displayed value via the resolver.
  5. Return the updated row in the same shape as the `/devices` listing (`{ deviceId, name, bridgeName, displayName, kind, … }`) so the UI can update the affected tile in place.

Bridge-first ordering matters: if we wrote locally first and the PUT failed, Warren's saved name and the bridge's name would diverge silently until the next poll's reconcile step. Bridge-first gives the user a synchronous, accurate error and keeps the two stores consistent.

Why `PATCH` on a sub-resource and not `PATCH /api/integrations/hue/devices/[deviceId]` with a partial body: this keeps the endpoint single-purpose and avoids implying that other device fields (kind, model, capabilities) are user-mutable. It also mirrors the existing `/api/integrations/hue/lights/[id]/state.post.ts` shape (sub-resource per concern).

Auth: covered by the existing `/api/*` session middleware.

### 5.2 Existing endpoints that surface Hue devices

For each, add `bridgeName` (raw `hue_devices.name`) to the response and use the resolved name for the user-facing field. No existing field is renamed or removed — additive only.

| Endpoint | File | Change |
|---|---|---|
| `GET /api/integrations/hue/devices` | `ui/server/api/integrations/hue/devices.get.ts` | Select `display_name` alongside `name`. Return `name = resolveHueName(display_name, name, device_id)`, `bridgeName = name`, `displayName = display_name`. |
| `GET /api/integrations/hue/status` | `ui/server/api/integrations/hue/status.get.ts` | Counts only — no per-device names. **No change.** |
| `GET /api/sensors` | `ui/server/api/sensors/index.get.ts` | Two code paths surface Hue: the "unassigned Hue lights" branch and the merged sensor list. Both join `hue_devices` and resolve `label = resolveHueName(hue_devices.display_name, hue_devices.name, device_id)` for Hue rows. Add `bridgeName` to the row shape for Hue rows only. ESP32 rows are unchanged. |
| `GET /api/sensors/discovered` | `ui/server/api/sensors/discovered.get.ts` | Same join + resolution for the Hue branch. ESP32 announcements unchanged. |
| `GET /api/rooms` | `ui/server/api/rooms/index.get.ts` | The sensors-per-room join currently reads `s.label`. Change to `LEFT JOIN hue_devices hd ON hd.device_id = s.device_id` and select the resolved name when `s.device_id LIKE 'hue-%'`, otherwise fall back to `s.label`. Expose `bridgeName` on Hue rows. |
| `PATCH /api/sensors/[id]` | `ui/server/api/sensors/[id].patch.ts` | Reject the request with `400 { code: 'hue_use_rename_endpoint' }` when the underlying `sensors.device_id LIKE 'hue-%'`. This prevents the legacy ESP32 label flow from clobbering Hue rows. ESP32 behavior is unchanged. |

### 5.3 Add Device dialog

The Add Device dialog reads `/api/sensors/discovered` and shows the bridge-supplied name (since the device hasn't been imported yet). After §5.2 the resolved `name` will equal the bridge name when no `display_name` is set, which matches the spec ("at that point there is no Warren name to display"). No extra change needed.

---

## 6. UI changes

### 6.1 Reusable rename modal component

Extract the inline modal currently in `ui/app/pages/sensors.vue:225–255` into a small component, e.g. `ui/app/components/HueRenameModal.vue`:

- Props: `deviceId: string`, `currentName: string | null` (the Warren `display_name`), `bridgeName: string`, `open: boolean`.
- Emits: `close`, `saved` (with the updated row from the API response).
- Single text input, `maxlength="32"` (Hue v1 cap), pre-filled with `currentName`. Bridge name shown as `placeholder` and as helper text below the input (`"Hue calls this: {bridgeName}"`). A second helper line notes that the name will also be visible in the Philips Hue app.
- Save button:
  - Disabled when `trimmed === (currentName ?? '')` (nothing changed).
  - Calls `PATCH /api/integrations/hue/devices/{deviceId}/name` with `{ name: trimmed === '' ? null : trimmed }`.
  - Shows a spinner while the request is in flight (the bridge call adds latency vs. a local-only write).
  - On success → emit `saved(row)` and close.
  - On error → inline error under the input. Surface the API `code` with friendly copy:
    - `name_too_long` → "Name must be 32 characters or fewer (Philips Hue limit)."
    - `bridge_unreachable` → "Couldn't reach the Hue Bridge. Check the bridge and try again."
    - `bridge_unauthorized` → "Hue Bridge rejected the request. Re-pair the bridge and try again."
    - `bridge_not_paired` → "No Hue Bridge is paired."
- "Use bridge name" secondary affordance: clears the field; submitting the empty field clears the Warren name on save (single round-trip, no bridge call).

This modal is **separate** from the existing ESP32 label modal — different endpoint, different copy ("Rename" vs "Edit label"), different helper text. The two coexist.

### 6.2 Surfaces that get the rename affordance

| Surface | File | Change |
|---|---|---|
| **Lights page** | `ui/app/pages/lights.vue` | Each light row gets a hover-visible pencil button. Click opens `HueRenameModal`. On `saved`, splice the new row into the local list. Search input already matches against `label`; once resolved server-side it just works. |
| **Sensors page** | `ui/app/pages/sensors.vue` | The page already has an edit pencil for ESP32 sensors. For rows where `device_id` starts with `hue-`, route the click to `HueRenameModal` instead of the existing ESP32 modal. Both modals can mount at the same time but only one is open per click. |
| **Room card** | `ui/app/components/RoomCard.vue` | Surface the pencil on each Hue tile **only when the room is in edit mode**, matching today's pattern for ESP32 sensors. On `saved`, refetch the room or splice the updated tile. |
| **Integrations Hue page** | `ui/app/pages/integrations/hue.vue` | Today this page shows counts only. Add a collapsible "Devices" section that lists `/api/integrations/hue/devices` rows with a pencil each. (Optional v1 polish — gate behind whether time permits; the room/lights/sensors surfaces alone satisfy all acceptance criteria.) |
| **Add Device dialog** | `ui/app/components/AddSensorModal.vue` | **No change.** Spec: "the discovered list shows the bridge-supplied name; after assignment, all subsequent surfaces honor the user-defined name." |

### 6.3 Search and filtering

Lights page: `ui/app/pages/lights.vue:36–40` filters on `label, deviceId, roomName`. Once the server returns the resolved name in `label`, this works unchanged.

Sensors page: same — its filter is over `label`. Unchanged.

---

## 7. Acceptance-criteria mapping

| Criterion | Where it's covered |
|---|---|
| Rename a Hue light from Lights page → propagates to room card and Sensors page | §5.2 (resolved server-side everywhere) + §6.2 (rename UI on Lights page) |
| Rename a Hue sensor from Sensors page or room card; persists | §1 (column) + §6.2 (UI) |
| Poll cycle does not overwrite the user-defined name | §4 |
| User-defined name survives stack restart | §1 (persistent column) |
| Submitting empty name reverts to bridge name | §5.1 (NULL ↔ revert, no bridge call) + §6.1 (clear-and-save flow) |
| Bridge name change while Warren name set: Warren name still shown; clearing reveals current bridge name | §4 (poller refreshes `name` and reconciles drift back to bridge) + §2 (resolution order). Note: with two-way sync, an external rename in the Hue app gets pushed back to Warren's name on the next poll while a `display_name` is set — Warren remains authoritative. |
| Disconnect + re-pair preserves names if `device_id` unchanged | §4 (re-pair only re-inserts; UPSERT preserves existing rows; reconcile pushes name back to bridge on first cycle). Full disconnect (`DELETE`) clears them — matches spec. |
| Search matches displayed name | §6.3 |
| Names > 32 chars rejected with clear message | §5.1 + §6.1 (server validation authoritative; input `maxlength` is the UX guard). 32-char limit comes from the Hue v1 API. |
| **(New) Renaming in Warren updates the name in the Philips Hue app** | §3 (`setLightName` / `setSensorName`) + §5.1 (bridge-first ordering) |

---

## 8. Open questions resolved by this plan

- **Source of truth**: `hue_devices.display_name`. `sensors.label` for Hue rows is migrated to the new column on first boot and then nulled, with the ESP32 label endpoint rejecting Hue device_ids.
- **Re-add after removal**: Because the poller upserts on `device_id` and never deletes rows on its own (only flips `available`), the `display_name` is preserved automatically. If the bridge is fully disconnected, devices are wiped and so is the name. On re-add the reconcile step pushes the name back to the bridge on the next cycle.
- **Push back to Hue Bridge**: **Implemented.** Bridge-first on the rename endpoint (synchronous push), plus a poller reconcile step for drift recovery.
- **External Hue-app rename while Warren name is set**: Warren wins. The next poll detects the drift and re-pushes Warren's `display_name` back to the bridge. To accept the Hue-app's name, the user clears the Warren name in Warren.
- **Audit log**: Out of scope per spec; not implemented.

## 9. Out of scope (deferred to a future iteration)

- Bulk rename / templated rename.
- Renaming Hue groups/rooms.
- Per-device "show bridge name as subtitle" toggle (the modal already shows it as helper text; making it a permanent on-tile subtitle is a separate UX decision).
- Async/background retry of failed bridge pushes (current behavior: synchronous push with rollback on failure; the next poll's reconcile step covers the case where the user later toggles the bridge online).

---

## 10. Implementation order

1. **Schema + migration** (§1) — additive column and one-shot data migration; verifiable by inspecting the DB after a restart.
2. **Resolution helper** (§2) — pure function; no behavior change yet.
3. **Bridge name-push helpers** (§3) — `setLightName` / `setSensorName` in `hue.ts`. Exercisable directly with a small script before wiring up.
4. **Rename API endpoint** (§5.1) — bridge-first PUT, then local update; testable via `curl` end-to-end (Hue app should reflect the change).
5. **Read-side endpoint updates** (§5.2) — turns the new column into observable display behavior across all surfaces.
6. **Poller reconcile step** (§4) — closes the loop for external Hue-app renames.
7. **Reusable modal + Lights/Sensors pages** (§6.1, §6.2 first two rows) — primary user flow.
8. **Room card edit-mode affordance** (§6.2 third row).
9. **Integrations Hue page device list** (§6.2 fourth row) — optional polish.
10. **Manual end-to-end pass against acceptance criteria** (§7) with the dev stack running (`./docker/warren start --dev`), including the new "renames also visible in the Philips Hue app" check.
