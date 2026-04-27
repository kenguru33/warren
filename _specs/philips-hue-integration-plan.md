# Implementation Plan: Philips Hue Integration

This plan grounds every decision in the existing Warren patterns: SQLite via `getDb()`/`initDb()` in `ui/server/utils/db.ts`, InfluxDB writes via `Point` in `ui/server/utils/influxdb.ts`, session-protected handlers under `ui/server/api/`, server-side background work via Nitro plugins (`ui/server/plugins/db.ts`, `ui/server/plugins/mqtt.ts`), and discovery merging in `ui/server/api/sensors/discovered.get.ts` + `ui/server/api/sensors/index.get.ts`.

The integration is built so a Hue light or Hue sensor flows through the **same** discovered → assign → room-card pipeline that ESP32 sensors use today, with the bridge poller acting as the equivalent of "MQTT + ESP32 firmware" producing readings into the existing `sensor_readings` measurement.

---

## 1. Schema additions (in `ui/server/utils/db.ts` `initDb()`)

All tables are added as new `CREATE TABLE IF NOT EXISTS` blocks inside the existing `db.exec(...)` template literal — no shadow-table dance is needed for v1 since they are fresh tables.

### `hue_bridge` (single-row "settings" table)
- `id` INTEGER PRIMARY KEY CHECK (id = 1) — singleton enforcement, only one bridge supported per spec.
- `bridge_id` TEXT NOT NULL — the bridge's own `bridgeid` from `/api/0/config` (16-hex).
- `name` TEXT — bridge friendly name (`Philips hue` etc.).
- `model` TEXT — `modelid` (e.g. `BSB002`).
- `ip` TEXT NOT NULL — last known LAN IP.
- `app_key` TEXT NOT NULL — username/application key the bridge issued.
- `last_sync_at` INTEGER — ms timestamp of last successful sync.
- `last_status` TEXT — one of `connected`, `unreachable`, `unauthorized`, `pairing`.
- `last_status_at` INTEGER.
- `created_at` INTEGER NOT NULL DEFAULT `(unixepoch('now') * 1000)`.

### `hue_devices` (one row per Hue light or Hue sensor on the bridge)
- `id` INTEGER PRIMARY KEY AUTOINCREMENT — Warren-side stable id used by the rest of the stack.
- `device_id` TEXT NOT NULL UNIQUE — composed key `hue-{bridgeId}-{hueResourceId}`. This is the same shape as ESP32 device_ids and slots into `sensors.device_id` cleanly.
- `bridge_id` TEXT NOT NULL — references `hue_bridge.bridge_id` (no FK; bridge row is singleton anyway).
- `hue_resource_id` TEXT NOT NULL — Hue's own id (numeric for v1 API or UUID for v2).
- `kind` TEXT NOT NULL CHECK (kind IN ('light','sensor')).
- `subtype` TEXT — for sensors: `temperature` | `motion` | `lightlevel` | `daylight`; for lights: `dimmable` | `onoff` | `color` (informational).
- `name` TEXT — bridge-supplied name (`"Living Room Lamp"`).
- `model` TEXT — Hue modelid, e.g. `LCT015`, `SML001`.
- `capabilities` TEXT — JSON blob: `{"brightness":true,"colorTemp":false,"color":false}`.
- `last_seen` INTEGER NOT NULL — ms timestamp; updated by the poller every cycle.
- `available` INTEGER NOT NULL DEFAULT 1 — set to 0 if device disappears from bridge response.
- `created_at` INTEGER NOT NULL DEFAULT `(unixepoch('now') * 1000)`.

### `hue_light_state` (current-state cache for lights — not in time series)
- `device_id` TEXT PRIMARY KEY REFERENCES `hue_devices(device_id)` ON DELETE CASCADE.
- `on` INTEGER NOT NULL DEFAULT 0.
- `brightness` INTEGER — 0–254 (Hue native), nullable for non-dimmable lights.
- `reachable` INTEGER NOT NULL DEFAULT 1.
- `updated_at` INTEGER NOT NULL.

### Integration with the existing `sensors` / `blocked_sensors` / discovery flow

The crucial design decision: **Hue sensors do not get a separate "registered Hue sensor" table — they reuse `sensors`**. When the user assigns a Hue temperature/motion sensor to a room from the discovered list, a row is inserted into `sensors` exactly like an ESP32 sensor would be: `device_id = "hue-{bridgeId}-{resourceId}"`, `type = "temperature"|"motion"`, `room_id = N`. From that point, `/api/rooms` and `/api/sensors/[id]/history` work without modification because they query `sensor_readings` by `device_id + sensor_type`, and the poller writes into that measurement using those same tags.

`blocked_sensors` works as-is for Hue sensors (`device_id`, `type` PK matches). For Hue **lights**, blocking is conceptually different (you don't want it to reappear in discovery) but type is `light` rather than one of the existing sensor types — `blocked_sensors.type` has no CHECK constraint so storing `type = 'light'` is fine.

The `sensors` table's `type` column has a CHECK constraint `IN ('temperature','humidity','camera','motion')`. **This must be relaxed** to also include `'light'` and `'lightlevel'` (and arguably `'daylight'`). Because SQLite cannot drop a CHECK with `ALTER TABLE`, this needs the shadow-table dance documented in `CLAUDE.md`:
- Detect via `PRAGMA table_info(sensors)` — but CHECK doesn't show there. Use `sqlite_master` SQL lookup or just add a "schema_version" sentinel row in a new tiny `meta` table to gate this migration once.
- Recommendation: introduce a `meta(key TEXT PRIMARY KEY, value TEXT)` table; on startup, if `hue_schema_v1` is missing, run `PRAGMA foreign_keys = OFF` → create `sensors_v2` with the new CHECK, copy, drop, rename, re-enable FKs, write the meta row. This mirrors the existing migration pattern.

### Indexes
- `CREATE INDEX IF NOT EXISTS idx_hue_devices_bridge ON hue_devices(bridge_id);`
- `CREATE INDEX IF NOT EXISTS idx_hue_devices_kind ON hue_devices(kind);`
- `device_id` already UNIQUE so it's indexed implicitly.

---

## 2. Hue Bridge client layer

Lives at `ui/server/utils/hue.ts` — sibling of `db.ts` and `influxdb.ts`. Pure module, no Nuxt/Nitro coupling, so it's unit-testable in isolation.

### Exports
- `discoverBridges(): Promise<{id: string, internalipaddress: string}[]>` — GETs `https://discovery.meethue.com`. On any failure returns `[]` (Philips' service is occasionally flaky; mDNS fallback is listed as v1.5).
- `pingBridge(ip: string): Promise<{bridgeid: string, name: string, modelid: string} | null>` — GETs `http://{ip}/api/0/config` (the unauthenticated subset works), used to verify a manual IP and fetch metadata.
- `requestAppKey(ip: string): Promise<{success: {username: string}} | {error: {type: number, description: string}}>` — single POST to `http://{ip}/api`, body `{"devicetype":"warren#nuxt"}`. Type `101` = link button not pressed.
- `pollForAppKey(ip: string, opts: {timeoutMs?: number, intervalMs?: number}): Promise<string>` — wraps `requestAppKey` in a loop; resolves with the username on success, rejects with a typed error on timeout. Default 30s timeout, 1s poll interval per spec.
- `getLights(ip: string, key: string): Promise<HueLightRaw[]>` — GET `/api/{key}/lights`, returns array form (Hue returns an object keyed by id; the helper normalizes to `[{id, ...}]`).
- `getSensors(ip: string, key: string): Promise<HueSensorRaw[]>` — GET `/api/{key}/sensors`, normalized similarly.
- `setLightState(ip, key, hueResourceId, body): Promise<void>` — PUT `/api/{key}/lights/{id}/state`, body `{"on":bool, "bri":0-254}`. Throws on HTTP non-2xx and on Hue error responses (Hue returns 200 even on errors with an `error` object in the array).
- Internal helpers: `unauthorizedError`, `linkButtonError`, `bridgeUnreachableError` — typed error classes so the calling layer can branch on them.

### Why v1 API
The spec's "Open Questions" asks v1 vs v2 EventStream. Recommendation: **use v1 polling for v1 of this feature**. Rationale: v1 does not need TLS pinning of the bridge cert (v2 EventStream over HTTPS does, and the bridge's cert is self-signed with a non-standard CA — that's an extra rabbit hole). Polling at a sensible cadence is well within the bridge's documented capacity. The `getLights` / `getSensors` helpers can be replaced by v2 implementations later without changing call sites.

### Link-button polling loop
`pollForAppKey` is the heart of pairing. It does NOT block an HTTP handler; instead the handler kicks off the poll, returns `202 Accepted` with a `pairing_id`, and a subsequent `GET /api/integrations/hue/status` (which the UI polls) reports progress. State machine in memory (module-scope `Map<string, PairingState>`) holds:
- `started_at`, `expires_at`, `last_attempt_at`, `last_error`, `result` (the appkey or terminal error).

Alternative: keep it inline in the POST handler — Hue's 30s polling window is short and Nitro handlers can block that long. Simpler. **Recommendation**: inline in the POST handler for v1 (simpler, no in-memory state to manage); revisit if UX needs progressive feedback. The handler returns `{ ok, bridgeId, name }` on success or `{ error: 'link_button_timeout' }` after timeout.

---

## 3. Background poller

Lives at `ui/server/plugins/hue.ts` — same shape as `mqtt.ts` (Nitro plugin, runs once at startup).

### Lifecycle
- On startup: read the singleton row from `hue_bridge`. If absent, register no timers and exit (the user hasn't paired yet).
- If present: kick off `runSyncCycle()` immediately, then `setInterval(runSyncCycle, intervalMs)`.
- The plugin exports a small module-scope object (`hueRuntime`) with:
  - `restart()` — called by the pair endpoint after successful pairing to start the loop without a server restart.
  - `stop()` — called by the disconnect endpoint to clear the timer.
  - `forceSync()` — called by `POST /api/integrations/hue/sync`.
  - `getStatus()` — last status, last_sync_at, counts. Read by `GET /api/integrations/hue/status`.

This pattern keeps the poller decoupled from HTTP: the plugin owns the timer, the API layer just nudges it.

### `runSyncCycle()` — what one tick does
1. Read bridge row; if `app_key` missing, mark unauthorized and bail.
2. Call `getLights` and `getSensors` in parallel.
3. On `unauthorizedError`: write `last_status='unauthorized'`, stop the timer (the user must re-pair). Do not retry blindly.
4. On network error: write `last_status='unreachable'`, schedule next tick on a backoff (recommend simple linear: skip every other tick after 3 consecutive failures, reset on success). Don't bombard the bridge.
5. On success: upsert each Hue device into `hue_devices` (`INSERT ON CONFLICT(device_id) DO UPDATE SET name=..., last_seen=..., available=1`). Mark devices not in the response as `available=0` but don't delete (preserves history references).
6. For each **light**, upsert its current state into `hue_light_state`.
7. For each **sensor**, write a point into the existing `sensor_readings` measurement using the existing pattern from `ui/server/api/sensors/[id]/reading.post.ts`:
   - `Point.measurement('sensor_readings').tag('device_id', hueDeviceId).tag('sensor_type', mappedType).tag('room_id', roomId|'unassigned').floatField('value', v).timestamp(new Date(toMs(hueLastUpdated)))`.
   - **Map types**: Hue `ZLLTemperature.state.temperature` (centi-degrees) → `sensor_type='temperature'`, value/100. Hue `ZLLPresence.state.presence` (bool) → `sensor_type='motion'`, value 1 or 0. Hue `ZLLLightLevel.state.lightlevel` (Hue's logarithmic format) → `sensor_type='lightlevel'`, value converted to lux.
   - Look up `room_id` from `sensors` table by `device_id + type` so the tag matches what other sensors get.
   - Deduplicate by Hue's `state.lastupdated`: skip if equal to last written for that device (avoids time-series spam at the poll cadence). Track this in module memory keyed by `device_id` — no extra table needed.
8. Update `hue_bridge.last_sync_at` and `last_status='connected'`.

### Cadence
Spec asks for "configurable but sensible default". Recommendation: **fixed at 10 seconds for v1**, hard-coded as a constant in `ui/server/plugins/hue.ts`. Rationale: matches the responsiveness users expect for motion (the existing ESP32 stack publishes far more often), bridge load is trivial (~6 req/min), and a configurable knob is a separate spec. Document the constant and revisit if the open question gets formal answer.

---

## 4. API layer (all under `ui/server/api/integrations/hue/`)

All session-protected — `01.auth.ts` does **not** need updates because none of these are device-facing. Confirmed by reading the middleware: anything not in `PUBLIC_*` is auto-protected.

### Files to create
- `ui/server/api/integrations/hue/status.get.ts` — returns `{ connected: bool, bridge: {id, name, ip, model} | null, lastSyncAt, lastStatus, counts: {lights, sensors} }`. Reads `hue_bridge` and `hue_devices`.
- `ui/server/api/integrations/hue/discover.post.ts` — calls `discoverBridges()` from the util layer, returns `[{id, ip, name?, model?}]`. May enrich each candidate via `pingBridge()`.
- `ui/server/api/integrations/hue/pair.post.ts` — body `{ ip: string }`. Calls `pollForAppKey`, on success calls `pingBridge` for metadata, writes the singleton `hue_bridge` row (`INSERT OR REPLACE` keyed on id=1), then calls `hueRuntime.restart()`. Returns `{ bridge: {...} }` or 4xx with reason.
- `ui/server/api/integrations/hue/sync.post.ts` — calls `hueRuntime.forceSync()`, returns the new status block.
- `ui/server/api/integrations/hue/index.delete.ts` — `DELETE /api/integrations/hue`. Calls `hueRuntime.stop()`, then in a single SQLite transaction:
  1. Delete `sensors` rows where `device_id LIKE 'hue-%'` (frees them from rooms; historical `sensor_readings` in InfluxDB are left untouched per spec).
  2. Delete `hue_light_state`, `hue_devices`, `hue_bridge` rows.
  3. Delete `blocked_sensors` rows where `device_id LIKE 'hue-%'`.
- `ui/server/api/integrations/hue/devices.get.ts` — returns `[{deviceId, kind, subtype, name, capabilities, roomId, blocked}]` joined with `sensors` for room assignment and `blocked_sensors` for blocked status. Used by the integrations UI overview and (optionally) the AddSensorModal Hue tab.
- `ui/server/api/integrations/hue/lights/[id]/state.post.ts` — `id` is the Warren `device_id`. Body `{ on?: boolean, brightness?: number /* 0-100 */ }`. Resolves the bridge IP/key, looks up `hue_resource_id` from `hue_devices`, scales 0-100 → 0-254, calls `setLightState`, then upserts `hue_light_state` optimistically. On Hue error returns 502 so the UI can revert.

### Existing files to modify

- **`ui/server/utils/db.ts`** — add the four new tables and the `meta` table; add the shadow-table migration that relaxes `sensors.type` CHECK to include `light`, `lightlevel`, `daylight`.

- **`ui/server/api/sensors/discovered.get.ts`** — at the merge step (before the final `return`), append discovered Hue devices. Specifically:
  - After computing `assignedSet`, query `SELECT device_id, kind, subtype, name, capabilities, last_seen FROM hue_devices WHERE available = 1`.
  - For Hue **sensors** (`kind='sensor'`), filter against `assignedSet` keyed by `device_id:subtype` exactly like InfluxDB rows, and emit `DiscoveredSensor` shapes with `sensorType=subtype`, `latestValue=null` (optionally pull from a small inline InfluxDB query for the latest temperature reading), `streamUrl=null`.
  - For Hue **lights** (`kind='light'`), emit a `DiscoveredSensor` with `sensorType='light'`, `latestValue=null`, and a new `meta` field on `DiscoveredSensor` (extend type) carrying `{ origin: 'hue', capabilities }` so the UI can render a Hue badge and pre-select the right type. The room-assignment endpoint then writes a `sensors` row with `type='light'`.
  - Filter out anything in `blocked_sensors`.

- **`ui/server/api/sensors/index.get.ts`** — at the assigned section, lights stored in `sensors` (type='light') won't have an InfluxDB row; the existing `latestMap` lookup will simply miss and return `null`. That's correct — but for the sensors page UI we should also surface `on/brightness/reachable` so the user can see state at a glance. Add a `LEFT JOIN hue_light_state hls ON hls.device_id = s.device_id` and surface `lightOn`, `lightBrightness`, `lightReachable` on the row. Mirror the same join in `assignedResult` mapping. (This is additive — existing fields are untouched.)

- **`ui/server/api/rooms/index.get.ts`** — same join as above so room dashboards get light state. Add `lightOn`, `lightBrightness`, `lightReachable`, `origin` to `SensorView`. The motion handling already in this file works for Hue motion sensors out of the box because they share the `sensor_readings` measurement.

- **`ui/server/api/sensors/index.post.ts`** — extend `VALID_TYPES` to include `'light'` and `'lightlevel'`. Logic remains unchanged: existing branch that re-assigns by `sensorId` is the path the user takes when picking a Hue device from the discovered list (we'll always create the `hue_devices` row first via the poller, then a `sensors` row only when assigned).
  - Actually a cleaner pattern: when the user assigns a Hue device, the AddSensorModal posts `{deviceId: 'hue-...', type: 'light'|'temperature'|...}`. There's no pre-existing `sensors` row, so the existing INSERT branch runs. Good — minimal change.

- **`ui/server/api/sensors/[id].delete.ts`** — when deleting a `sensors` row whose `device_id` is a Hue id, do NOT delete `sensor_announcements` (none exist) and do NOT delete `hue_devices` (the device still exists on the bridge). Just remove the `sensors` row so it falls back into the discovered list. Add a guard that recognizes `device_id LIKE 'hue-%'`.

- **`ui/server/api/sensors/block.delete.ts`** — already handles arbitrary `(device_id, type)` pairs; works for Hue without modification, except: for `type='light'`, blocking should also flag the light invisible without disturbing the bridge. The existing path inserts into `blocked_sensors` then deletes `sensor_announcements` (no-op for Hue). Good.

- **`ui/server/api/rooms/[id]/sensors/[sensorId].delete.ts`** — already nulls `room_id`, no Hue-specific change needed.

- **`ui/shared/types.ts`** — extend:
  - `SensorType` to `'temperature' | 'humidity' | 'camera' | 'motion' | 'light' | 'lightlevel'`.
  - Add optional `origin?: 'esp32' | 'hue'`, `capabilities?: { brightness?: boolean }`, `lightOn?: boolean`, `lightBrightness?: number`, `lightReachable?: boolean` to `SensorView`.
  - Add the same `origin` / `capabilities` to `DiscoveredSensor`.

---

## 5. UI plan (Nuxt pages and components)

### New files
- `ui/app/pages/integrations/hue.vue` — the integrations page. Renders one of three states based on `GET /api/integrations/hue/status`:
  - **Not connected**: "Connect Hue Bridge" button → triggers the pairing wizard component below.
  - **Pairing in progress**: shown by the wizard component itself.
  - **Connected**: bridge name/IP/model, last sync time, light/sensor counts, "Sync now" button (POST `/sync`), "Disconnect" button (with `ConfirmDialog`).
  - Errors render inline via the existing dark card styling (mirror the `.modal-card` look from `pages/index.vue`).
- `ui/app/components/HuePairingModal.vue` — the wizard:
  - Step 1: spinner + "Looking for bridges on your network" → shows discovery results.
  - Step 1b (no results): manual IP entry input.
  - Step 2: "Press the link button on your bridge now. Waiting…" with a 30s countdown ring (CSS-only). POSTs `/pair` and awaits the response.
  - Step 3: success → close, parent refreshes. Failure → "We didn't see the link button being pressed" with retry / cancel.
- `ui/app/components/HueLightTile.vue` — a sensor tile component used inside `RoomCard.vue` for Hue lights:
  - Bulb icon, label, on/off toggle (CSS switch — reuse the `.toggle-switch` styling from `RoomCard.vue`'s edit panel), brightness slider when `capabilities.brightness === true`.
  - Toggle and slider call `POST /api/integrations/hue/lights/{deviceId}/state` with optimistic state. On error, snap back and surface a small inline "couldn't reach bridge" hint.
  - Shows "Unreachable" badge when `lightReachable === false`.

### Modified files
- `ui/app/layouts/default.vue` — add `{ to: '/integrations/hue', label: 'Integrations' }` to `navLinks`. (Or a future generic "Integrations" page if/when multiple integrations land — for now a direct Hue link is fine.)
- `ui/app/components/RoomCard.vue` — within the `<div class="sensor-grid">`, add a `v-for="light in lights"` block (computed from `room.sensors.filter(s => s.type === 'light')`) that renders `<HueLightTile :sensor="light" />`. Hue sensors of type temperature/motion/lightlevel render through the existing tile branches automatically once `SensorView.type` accepts them — no shape change beyond adding a `lightlevel` branch in the temperature/humidity-style group.
- `ui/app/components/AddSensorModal.vue` — currently the discovered list mixes types and the user picks one. Add:
  - A small Hue badge (e.g. an orange "H" pill) on rows where `d.origin === 'hue'`.
  - When the selected device has `origin='hue'`, the submit payload uses `type` from `d.sensorType` (which already maps correctly: `light`, `temperature`, `motion`, `lightlevel`). No new modal — just visual differentiation.
- `ui/app/composables/useRooms.ts` — no change required. The new optional fields on `SensorView` flow through transparently.
- `ui/app/pages/sensors.vue` — extend `typeIcon` and `typeLabel` to include `light` (bulb emoji) and `lightlevel`. The existing offline/age/relay rendering still applies.

### Pairing UX flow at component level
1. User clicks "Connect Hue Bridge" on `pages/integrations/hue.vue`.
2. Page sets `pairing.value = true`, mounts `<HuePairingModal>`.
3. Modal `onMounted`: `await $fetch('/api/integrations/hue/discover', {method:'POST'})`. Renders the candidates as buttons; if empty, shows manual IP form.
4. User clicks a candidate (or submits IP). Modal sets `state='waiting'`, starts a 30-second visual countdown, and `await $fetch('/api/integrations/hue/pair', {method:'POST', body:{ip}})`. The handler blocks for up to 30s polling the bridge.
5. On success: modal emits `paired`, parent calls `refresh()` on the status fetch and closes the modal. On 4xx with `error: 'link_button_timeout'`: modal switches to retry view.

---

## 6. Order of work (commit boundaries)

Each step is independently runnable; the stack stays green between commits.

1. **Schema + types** — `ui/server/utils/db.ts` (new tables, meta table, sensors CHECK migration), `ui/shared/types.ts` (extend `SensorType`, `SensorView`, `DiscoveredSensor`). Verify: `npm run dev`, hit existing endpoints, confirm DB initializes. Commit: `feat(hue): add hue_bridge/hue_devices/hue_light_state tables and relax sensor CHECK`.

2. **Hue client utility** — `ui/server/utils/hue.ts`. No wiring yet; just the module. No behavior change in the running app. Commit: `feat(hue): add Hue Bridge HTTP client (discover, pair, lights, sensors)`.

3. **API endpoints (read-only first)** — `status.get.ts`, `discover.post.ts`, `devices.get.ts`. The integrations page can be sketched against these without writing anything to the DB. Commit: `feat(hue): add /api/integrations/hue read endpoints`.

4. **Pairing endpoints** — `pair.post.ts` and `index.delete.ts`. After this commit a developer can pair via curl, see the row in `hue_bridge`, and delete it. Commit: `feat(hue): pair and disconnect endpoints`.

5. **Background poller** — `ui/server/plugins/hue.ts` plus `sync.post.ts`. After paired, lights/sensors populate `hue_devices`, and Hue sensor readings appear in InfluxDB; visible by querying `sensor_readings` directly. Commit: `feat(hue): background poller writing Hue readings to InfluxDB`.

6. **Discovery integration** — modify `ui/server/api/sensors/discovered.get.ts` and `ui/server/api/sensors/index.post.ts` (`VALID_TYPES`). At this point Hue devices appear in the existing `AddSensorModal` (without the badge yet) and can be assigned to rooms. Hue motion/temperature already render correctly because the existing tiles handle them. Commit: `feat(hue): surface Hue devices in discovered-sensors and allow room assignment`.

7. **Light state and control** — `lights/[id]/state.post.ts` plus `hue_light_state` joins in `sensors/index.get.ts` and `rooms/index.get.ts`. Lights now report state through the existing API. Commit: `feat(hue): hue_light_state and bridge-routed light control endpoint`.

8. **UI: integrations page + pairing wizard** — `pages/integrations/hue.vue`, `components/HuePairingModal.vue`, sidebar nav update. Pairing flow now usable end-to-end. Commit: `feat(hue): integrations page and pairing wizard`.

9. **UI: room dashboard light tiles** — `components/HueLightTile.vue`, `RoomCard.vue` integration, `AddSensorModal.vue` badge, `sensors.vue` icon/label additions. Lights are controllable from room cards. Commit: `feat(hue): hue light tile and discovered-device hue badge`.

10. **Polish: backoff, status surfacing, error states** — `last_status='unauthorized'` re-pair prompt, offline indicator on integrations page, manual sync button feedback. Commit: `feat(hue): connection-status surfacing and reconnect backoff`.

---

## 7. Open risks / decisions and recommendations

| Topic | Recommendation |
|---|---|
| **v1 vs v2 EventStream** | **v1 polling** for this iteration. v2 EventStream needs HTTPS to a self-signed bridge cert and pinning to the bridge ID; non-trivial in Node fetch. Polling at 10s is fine. Re-evaluate if motion latency is a complaint. |
| **Polling cadence** | **Hard-coded 10 seconds.** Spec says "configurable but sensible default". Configurability is a UI surface that doesn't pay for itself yet; ship a constant `HUE_POLL_INTERVAL_MS = 10_000` in `ui/server/plugins/hue.ts`. |
| **Color / color-temperature control** | **Defer.** Spec lists this as an open question. v1 ships on/off + brightness only. The `capabilities` JSON column already has slots for `colorTemp` and `color` so a later commit just needs UI controls and a `setLightState` extension. |
| **Hue v1 vs v2 resource IDs** | v1 IDs are short integers and stable per bridge; v2 IDs are UUIDs. Use **v1 IDs** so we stay on the v1 API uniformly. Compose `device_id = "hue-{bridgeId}-{v1Id}"`. |
| **Hue groups/rooms vs Warren rooms** | **Ignore Hue groups for v1.** The spec's open question says ignored/imported/read-only — choose ignored for simplicity. Document the decision so users aren't surprised. |
| **Naming authority** | When the user reassigns a sensor in Hue's app, Warren's poller upserts `hue_devices.name` from the bridge — but the user's Warren `sensors.label` is independent and stays authoritative on dashboards. Recommendation: use Hue name as the discovered-list label (refreshed every cycle), Warren label overrides once assigned. |
| **Disconnection: what happens to `sensors` rows for Hue?** | Spec says "remove Hue light entities and detach Hue sensors from rooms". Implementation: delete `sensors` rows where `device_id LIKE 'hue-%'` outright. History in InfluxDB persists, retrievable by raw query. |
| **Singleton enforcement** | Use `CHECK(id=1)` plus `INSERT OR REPLACE` keyed on id=1 — simpler than a uniqueness constraint on `bridge_id`. Spec explicitly limits to one bridge for v1. |
| **mDNS fallback for discovery** | **Defer.** Philips' discovery service plus manual IP entry covers ~99% of cases. Add `node-bonjour` only if real users hit the gap. |
| **Brightness scale in API** | The Hue v1 `bri` field is 0–254 (not 255). Always scale 0–100 UI ↔ 0–254 wire in the `lights/[id]/state.post.ts` handler; never expose raw Hue scale to the UI. |
| **Optimistic toggle reconciliation** | After a 200 from `setLightState`, write the optimistic state to `hue_light_state` immediately (don't wait for the next poll cycle) so the room dashboard's next fetch reflects the change. |

---

## 8. Testing strategy

The repo has **no unit-test framework in the UI** (`package.json` has no `test` script and no Vitest). Existing tests are bash integration tests under `docker/tests/`. The plan honors that — don't introduce a JS test runner mid-feature.

### Read-side / quick-smoke tests (manual, repeatable)
- After step 1 (schema): `sqlite3 ui/.data/warren.db ".tables"` confirms new tables exist.
- After step 4 (pair): `curl -X POST http://localhost:3000/api/integrations/hue/discover` (with a session cookie from the login flow) returns candidates; `curl -X POST .../pair -d '{"ip":"..."}'` after pressing the link button writes a row visible in `hue_bridge`.
- After step 5 (poller): `influx query 'SELECT * FROM sensor_readings WHERE device_id LIKE '"'"'hue-%'"'"' LIMIT 5'` shows rows.
- After step 6 (discovery): `curl /api/sensors/discovered` shows Hue devices alongside ESP32 ones.

### What to mock
- `ui/server/utils/hue.ts` should be the only thing talking to the bridge. If we add a `HUE_FAKE=1` env, it can short-circuit `getLights`/`getSensors` to canned fixtures so a developer without a physical bridge can drive the UI end to end. Recommendation: add this; it will be invaluable during UI work in steps 8–9.
- The pairing endpoint should similarly accept `HUE_FAKE_KEY=...` so step 4 is testable without a live bridge.

### What to hit live
- The actual bridge — at least one full end-to-end pass on a developer machine before merging. The acceptance criteria from the spec drive this:
  - Discovery + pair + see "Connected".
  - Assign a light, toggle it from the dashboard.
  - Assign a temp sensor, watch readings appear in the history modal.
  - Restart the stack, confirm reconnection.
  - Disconnect, confirm `sensors` Hue rows gone but InfluxDB history retained.

### Existing patterns to extend
- The bash integration tests in `docker/tests/` cover stack lifecycle, not API behavior. Don't extend them for Hue v1 — the integration's failure modes are all about external network state (the bridge) which docker tests can't simulate. Document the manual checklist in the PR description.

---

## Critical Files for Implementation

- `ui/server/utils/db.ts`
- `ui/server/utils/hue.ts` (new)
- `ui/server/plugins/hue.ts` (new)
- `ui/server/api/sensors/discovered.get.ts`
- `ui/app/components/RoomCard.vue`
