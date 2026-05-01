# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

```
ESP32 firmware  →  MQTT (Mosquitto :1883)  →  Node-RED  →  InfluxDB :8086
                                                                ↑
                                Next.js UI  ←──────────────────+
                              (SQLite + HTTP API :3000)
```

- **`firmware/`** — two PlatformIO/Arduino projects for ESP32 microcontrollers
  - `sensor/` — reads DHT22 (temp/humidity), publishes via MQTT, controls heater/fan relays
  - `camera/` — serves MJPEG stream and JPEG snapshot over HTTP, announces itself to the UI on boot
- **`nextjs-ui/`** — **Next.js 16 app** (App Router + Tailwind v4 + Catalyst). Serves the dashboard and the REST API backed by SQLite + InfluxDB. This is the canonical UI.
- **`docker/`** — Mosquitto, Node-RED, InfluxDB 3, InfluxDB Explorer; managed by the `warren` CLI

## Running the stack

```bash
./docker/warren setup          # First-time: generate secrets, install + build the Next.js app
./docker/warren start          # Infrastructure + UI (production)
./docker/warren start --dev    # Infrastructure + Next.js dev server
./docker/warren stop
./docker/warren restart <svc>  # Restart one Docker Compose service
./docker/warren clear          # DESTRUCTIVE: wipe all data and secrets
```

UI-only development (infrastructure must already be running):

```bash
cd nextjs-ui && npm run dev      # Dev server at localhost:3000
cd nextjs-ui && npm run build    # Production build
cd nextjs-ui && npm run test:e2e # Playwright E2E suite
```

Docker integration tests:

```bash
cd docker && ./tests/run_tests.sh
```

## Sub-directory docs

- [`firmware/CLAUDE.md`](firmware/CLAUDE.md) — build, flash, GPIO pinout, FreeRTOS tasks, Wokwi simulation
- [`nextjs-ui/CLAUDE.md`](nextjs-ui/CLAUDE.md) — Next.js 16 structure, App Router, route handlers, instrumentation, proxy
- [`docker/CLAUDE.md`](docker/CLAUDE.md) — warren CLI details, services, ports, data flow

## Feature development workflow

New features start with a spec file in `_specs/` (use `_specs/template.md` as the template), then a plan, then implementation on a `claude/feature/<slug>` branch.

## Cross-cutting conventions

### MQTT topics

Sensor firmware publishes to `warren/sensors/{deviceId}/{type}` (e.g. `warren/sensors/esp32-a1b2c3/temperature`). The Next.js server boots an MQTT subscriber via `instrumentation.ts` that listens on `warren/sensors/+/announce` for camera discovery.

### Timestamps

| Layer | Format | Example |
|---|---|---|
| SQLite | ms integer (`unixepoch('now') * 1000`) | `1735000000000` |
| InfluxDB `time` column | nanosecond bigint | `1735000000000000000n` |
| JavaScript | `Date.now()` ms | `1735000000000` |

InfluxDB nanoseconds → ms: `Number(bigint / 1_000_000n)`. The route handlers share a `toMs()` helper for this.

### Auth proxy (`nextjs-ui/proxy.ts`)

Next.js 16 `proxy.ts` (renamed from `middleware.ts`) enforces session-based auth on `/api/*` routes. All `/api/*` routes require an `iron-session` cookie **except**:
- `PUBLIC_EXACT`: `/api/auth/login`, `/api/auth/logout`, `/api/auth/session`, `/api/sensors/announce`
- `PUBLIC_PREFIXES`: `/api/sensors/config/` — ESP32 fetches its own config without a browser session
- `PUBLIC_PATTERNS`: `/api/sensors/{id}/reading` — ESP32 posts readings without a session

Any new device-facing endpoint must be added to one of these lists in `nextjs-ui/proxy.ts`. Browser-page requests without a session are redirected to `/login` by the same proxy.

### Database (`nextjs-ui/lib/server/db.ts`)

- `getDb()` returns a singleton `better-sqlite3` instance. The DB file lives at `${WARREN_DATA_DIR}/warren.db` (defaults to `<cwd>/.data/warren.db`).
- `initDb()` runs at server start via `instrumentation.ts` → `lib/server/boot.ts`.
- Schema lives entirely in `initDb()` as `CREATE TABLE IF NOT EXISTS` statements.
- Column additions that SQLite can't do with `ALTER TABLE` (e.g. removing `NOT NULL`) are handled by creating a shadow table, copying data, dropping the original, and renaming — with `PRAGMA foreign_keys = OFF` during the migration.

### InfluxDB (`nextjs-ui/lib/server/influxdb.ts`)

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

A Philips Hue bridge is a first-class data source alongside the ESP32 fleet. Lives entirely inside `nextjs-ui/`:

- **Tables** (created in `initDb()`):
  - `hue_bridge` — single-row config (`id = 1`): bridge IP, app key, last-sync state.
  - `hue_devices` — every light/sensor the bridge exposes; `kind` is `light` or `sensor`, `device_id` is `hue-{bridgeId}-{resourceId}`, `capabilities` is JSON (e.g. color/dimming).
  - `hue_light_state` — last-known on/brightness/color cache, refreshed by the poller.
- **Background poller**: `lib/server/hue/runtime.ts` is started from `lib/server/boot.ts` (which is invoked by `instrumentation.ts`). Polls every 10s by default, upserts into `hue_devices` + `hue_light_state`, and writes time-series readings into the `sensor_readings` InfluxDB measurement so Hue motion/lightlevel sensors share the same history pipeline as ESP32 sensors. The runtime stores its `setInterval` handle on `globalThis` so dev HMR doesn't leak timers.
- **Endpoints**: `app/api/integrations/hue/` exposes setup (`POST /api/integrations/hue/pair`), discovery (`POST /api/integrations/hue/discover`), sync, and per-light state (`POST /api/integrations/hue/lights/{deviceId}/state` accepts `{ on, brightness, color: '#rrggbb', theme: <key> }`).
- **device_id convention**: every Hue device has a `hue_devices` row, but only those assigned to a room also have a `sensors` row. Code that operates on "all Hue lights" (e.g. the master switch in `app/api/lights/master-state/route.ts`) joins `hue_devices LEFT JOIN sensors`, not the other way around.

### Light groups

Rooms can group multiple lights (Hue or otherwise) into a single controllable unit:

- **Tables**: `light_groups` (per-room name + theme key), `light_group_members` (sensor_id refs).
- **Fan-out**: `lib/server/light-groups.ts` exports `fanOutLightCommand(db, members, command)` which issues the same command to every member in parallel and returns `{ successCount, failureCount, total }`. Used by both the per-group `state` endpoint and the global `/api/lights/master-state` endpoints.
- **Themes**: `lib/shared/light-themes.ts` defines the `LIGHT_THEMES` map (`slate`, `amber`, `emerald`, `rose`, `indigo`, `teal`, `plum`, `terracotta`, `catppuccin`, `tokyoNight`, `dracula`, `nord`, `gruvbox`). The `LightThemeKey` type is the source of truth — passing an unknown key crashes the theme picker with a confusing downstream error. The same file also exports `hexToXy()` for converting CSS hex to Hue's xy color space.

### Shared code (`nextjs-ui/lib/shared/`)

`lib/shared/types.ts` and `lib/shared/light-themes.ts` are imported by both client (`'use client'` components) and server (route handlers, runtime). Cross-tier types and helpers belong here.

### UI styling conventions

- **Tailwind v4** via `@tailwindcss/postcss` — CSS-first config in `nextjs-ui/app/globals.css` using `@theme`. There is no `tailwind.config.js`.
- **Catalyst-pattern UI** — Tailwind Plus's Catalyst design system, in React via Headless UI React + Heroicons. Generic primitives live in `app/components/`; domain components live in `app/components/warren/`.
- **Semantic color tokens** — components use `bg-surface`, `bg-surface-2`, `bg-default`, `bg-modal`, `text-text`, `text-subtle`, `text-muted`, `ring-default`, `bg-accent-soft`, `text-accent-strong`. Six color schemes (`zinc-indigo`, `slate-sky`, `stone-amber`, `neutral-emerald`, `gray-rose`, `zinc-violet`) swap the underlying values via the `data-scheme` attribute on `<html>`. Persisted to `localStorage` under `warren:scheme`; an inline bootstrap script in `app/layout.tsx` applies it before first paint.
- **Dark by default** — `localStorage warren:theme` controls light/dark; bootstrap script defaults to dark.
- **Touch-vs-mouse hover** — controls that auto-hide use the `pointer-fine:` Tailwind v4 variant (`pointer-fine:opacity-0 pointer-fine:group-hover/tile:opacity-100`) so touch devices keep the controls visible while mouse devices get the hover-reveal behavior. Do not use plain `group-hover` for hide/show on touch-affecting UI.

### Server boot (`nextjs-ui/instrumentation.ts`)

Next.js's `instrumentation.ts` is the App-Router-friendly equivalent of Nuxt's `defineNitroPlugin()` — it runs once when the Node server starts. Warren uses it to call `bootServer()` from `lib/server/boot.ts`, which:

1. Initializes the SQLite schema (`initDb()`).
2. Opens a long-lived MQTT connection and subscribes to `warren/sensors/+/announce`.
3. Starts the Hue runtime poller.
4. Registers SIGTERM/SIGINT handlers for clean shutdown.

The boot is gated on `process.env.NEXT_RUNTIME === 'nodejs'` so it never runs in Edge contexts. Each subsystem caches its state on `globalThis` to survive dev HMR without leaking connections or timers.
