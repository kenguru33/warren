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
