# CLAUDE.md

Root guidance for the Warren monorepo. See sub-directory CLAUDE.md files for component-specific details.

## Architecture

```
ESP32 firmware  →  MQTT (Mosquitto)  →  Node-RED  →  InfluxDB
                                                         ↑
                              Nuxt UI  ←────────────────-+
                         (SQLite + HTTP API)
```

- **`firmware/`** — two PlatformIO/Arduino projects for ESP32 microcontrollers
  - `sensor/` — reads DHT22 (temp/humidity), publishes via MQTT, controls relays
  - `camera/` — serves MJPEG stream and JPEG snapshot over HTTP, announces itself to the UI on boot
- **`ui/`** — Nuxt 4 app; serves the dashboard and a REST API backed by SQLite + InfluxDB
- **`docker/`** — Mosquitto, Node-RED, InfluxDB 3, InfluxDB Explorer; managed by the `warren` CLI

## Running the full stack

```bash
# First-time setup (generates all secrets and config)
./docker/warren setup

# Start everything (infrastructure + UI)
./docker/warren start

# Development mode (Nuxt dev server instead of production build)
./docker/warren start --dev
```

## Sub-directory docs

- [`firmware/CLAUDE.md`](firmware/CLAUDE.md) — build, flash, GPIO, Wokwi simulation
- [`ui/CLAUDE.md`](ui/CLAUDE.md) — Nuxt commands, server architecture, env vars
- [`docker/CLAUDE.md`](docker/CLAUDE.md) — warren CLI, services, ports, data flow
