# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

```
ESP32 firmware  →  MQTT (Mosquitto :1883)  →  Node-RED  →  InfluxDB :8086
                                                                ↑
                                   Nuxt UI  ←──────────────────+
                              (SQLite + HTTP API :3000)
```

- **`firmware/`** — two PlatformIO/Arduino projects for ESP32 microcontrollers
  - `sensor/` — reads DHT22 (temp/humidity), publishes via MQTT, controls heater/fan relays
  - `camera/` — serves MJPEG stream and JPEG snapshot over HTTP, announces itself to the UI on boot
- **`ui/`** — Nuxt 4 app; serves the dashboard and a REST API backed by SQLite + InfluxDB
- **`docker/`** — Mosquitto, Node-RED, InfluxDB 3, InfluxDB Explorer; managed by the `warren` CLI
- **`nextjs-ui/`** — exploratory Next.js port. NOT part of the running stack and NOT auto-synced with `ui/`. Treat it as a sandbox; do not propagate `ui/` changes into it unless explicitly asked.

## Running the stack

```bash
./docker/warren setup          # First-time: generate secrets, build UI
./docker/warren start          # Infrastructure + UI (production)
./docker/warren start --dev    # Infrastructure + Nuxt dev server
./docker/warren stop
./docker/warren restart <svc>  # Restart one Docker Compose service
./docker/warren clear          # DESTRUCTIVE: wipe all data and secrets
```

UI-only development (infrastructure must already be running):

```bash
cd ui && npm run dev            # Dev server at localhost:3000
cd ui && npm run build          # Production build
```

Docker integration tests:

```bash
cd docker && ./tests/run_tests.sh
```

## Sub-directory docs

- [`firmware/CLAUDE.md`](firmware/CLAUDE.md) — build, flash, GPIO pinout, FreeRTOS tasks, Wokwi simulation
- [`ui/CLAUDE.md`](ui/CLAUDE.md) — Nuxt 4 structure, npm commands
- [`docker/CLAUDE.md`](docker/CLAUDE.md) — warren CLI details, services, ports, data flow

## Feature development workflow

New features start with a spec file in `_specs/` (use `_specs/template.md` as the template), then a plan, then implementation on a `claude/feature/<slug>` branch. The `template.md` at the repo root is an older minimal template; `_specs/template.md` is the canonical one.

## Cross-cutting conventions

### MQTT topics

Sensor firmware publishes to `warren/sensors/{deviceId}/{type}` (e.g. `warren/sensors/esp32-a1b2c3/temperature`). The Nuxt server plugin subscribes to `warren/sensors/+/announce` for camera discovery.

### Timestamps

| Layer | Format | Example |
|---|---|---|
| SQLite | ms integer (`unixepoch('now') * 1000`) | `1735000000000` |
| InfluxDB `time` column | nanosecond bigint | `1735000000000000000n` |
| JavaScript | `Date.now()` ms | `1735000000000` |

InfluxDB nanoseconds → ms: `Number(bigint / 1_000_000n)`. Both server routes share a `toMs()` helper for this.

### Auth middleware (`ui/server/middleware/01.auth.ts`)

All `/api/*` routes require a session **except**:
- `PUBLIC_EXACT`: `/api/auth/login`, `/api/auth/logout`, `/api/_auth/session`, `/api/sensors/announce`
- `PUBLIC_PREFIXES`: `/api/sensors/config/` — ESP32 fetches its own config without a browser session
- `PUBLIC_PATTERNS`: `/api/sensors/{id}/reading` — ESP32 posts readings without a session

Any new device-facing endpoint must be added to one of these lists in the middleware.

### Database (`ui/server/utils/db.ts`)

- `getDb()` returns a singleton `better-sqlite3` instance; `initDb()` runs on server startup via `ui/server/plugins/db.ts`.
- Schema lives entirely in `initDb()` as `CREATE TABLE IF NOT EXISTS` statements.
- Column additions that SQLite can't do with `ALTER TABLE` (e.g. removing `NOT NULL`) are handled by creating a shadow table, copying data, dropping the original, and renaming — with `PRAGMA foreign_keys = OFF` during the migration.

### InfluxDB (`ui/server/utils/influxdb.ts`)

- `queryInflux(sql)` runs SQL against the `warren` bucket and returns rows as plain objects.
- Returns `[]` (not an error) when the measurement doesn't exist yet — guards against empty-database startup.

### Relay state

`heaterActive` / `fanActive` are computed on every API response from the latest sensor reading + `sensor_config` table — never stored. Heater ON: `temp ≤ refTemp − heaterOnOffset`; heater OFF: `temp ≥ refTemp + heaterOffOffset` (hysteresis). Fan ON: `temp > refTemp + fanThreshold`. Falls back to hardcoded 18/22/30 °C when `refTemp` is NULL.

### Sensor discovery

Unassigned sensors appear from three sources merged in `GET /api/sensors/discovered`:
1. InfluxDB (`sensor_readings` measurements with no matching `sensors` row)
2. `sensor_announcements` table (populated by camera HTTP POSTs and MQTT announces)
3. Persisted `sensors` rows with `room_id IS NULL` (previously assigned, then removed from a room)

Blocked sensors (`blocked_sensors` table) are excluded from all three.

### Hue Bridge integration

A Philips Hue bridge is a first-class data source alongside the ESP32 fleet. Lives entirely inside `ui/`:

- **Tables** (created in `initDb()`):
  - `hue_bridge` — single-row config (`id = 1`): bridge IP, app key, last-sync state.
  - `hue_devices` — every light/sensor the bridge exposes; `kind` is `light` or `sensor`, `device_id` is `hue:{bridgeId}:{resourceId}`, `capabilities` is JSON (e.g. color/dimming).
  - `hue_light_state` — last-known on/brightness/color cache, refreshed by the poller.
- **Background poller**: `server/plugins/hue.ts` boots `hueRuntime` from `server/utils/hue-runtime.ts` at server start. Polls every 10s by default, upserts into `hue_devices` + `hue_light_state`, and writes time-series readings into the `sensor_readings` InfluxDB measurement so Hue motion/lightlevel sensors share the same history pipeline as ESP32 sensors.
- **Endpoints**: `server/api/integrations/hue/` exposes setup (`POST /api/integrations/hue` to pair), sync, and per-light state (`POST /api/integrations/hue/lights/{deviceId}/state` accepts `{ on, brightness, color: '#rrggbb', theme: <key> }`).
- **device_id convention**: every Hue device has a `hue_devices` row, but only those assigned to a room also have a `sensors` row. Code that operates on "all Hue lights" (e.g. the master switch in `server/api/lights/master-state.*`) joins `hue_devices LEFT JOIN sensors`, not the other way around.

### Light groups

Rooms can group multiple lights (Hue or otherwise) into a single controllable unit:

- **Tables**: `light_groups` (per-room name + theme key), `light_group_members` (sensor_id refs).
- **Fan-out**: `server/utils/light-groups.ts` exports `fanOutLightCommand(db, members, command)` which issues the same command to every member in parallel and returns `{ successCount, failureCount, total }`. Used by both the per-group `state` endpoint and the global `/api/lights/master-state.post.ts`.
- **Themes**: `ui/shared/utils/light-themes.ts` defines the `LIGHT_THEMES` map (`slate`, `amber`, `emerald`, `rose`, `indigo`, `teal`, `plum`, `terracotta`, `catppuccin`, `tokyoNight`, `dracula`, `nord`, `gruvbox`). The `LightThemeKey` type is the source of truth — passing an unknown key (e.g. the historical mistake `'warm-amber'`) crashes `LightThemePicker.vue` with a confusing downstream error. The same file also exports `hexToXy()` for converting CSS hex to Hue's xy color space.

### Shared types and the `ui/shared/` directory

`ui/shared/types.ts` and `ui/shared/utils/*` are imported by both client (`app/`) and server (`server/`) code. Nuxt 4's `shared/` is the canonical place for cross-tier code; do not put shared types in `app/types/` or duplicate them on the server side.

### UI styling conventions

- **Tailwind v4** via `@tailwindcss/vite` — CSS-first config in `ui/app/assets/css/main.css` using `@theme`. There is no `tailwind.config.js`.
- **Catalyst-pattern UI** — Tailwind UI's Catalyst design system, ported to Vue using Headless UI Vue + Heroicons. Look for `Catalyst …` comments in layouts/pages.
- **Semantic color tokens** — components use `bg-surface`, `bg-surface-2`, `bg-default`, `bg-modal`, `text-text`, `text-subtle`, `text-muted`, `ring-default`, `bg-accent-soft`, `text-accent-strong`. Six color schemes (`zinc-indigo`, `slate-sky`, `stone-amber`, `neutral-emerald`, `gray-rose`, `zinc-violet`) swap the underlying values via the `data-scheme` attribute on `<html>`. Persisted to `localStorage` under `warren:scheme`; the inline `themeBootstrapScript` in `ui/nuxt.config.ts` applies it before first paint.
- **Dark by default** — `localStorage warren:theme` controls light/dark; bootstrap script defaults to dark.
- **Touch-vs-mouse hover** — controls that auto-hide use the `pointer-fine:` Tailwind v4 variant (`pointer-fine:opacity-0 pointer-fine:group-hover/tile:opacity-100`) so touch devices keep the controls visible while mouse devices get the hover-reveal behavior. Do not use plain `group-hover` for hide/show on touch-affecting UI.
