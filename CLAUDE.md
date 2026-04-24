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
- **`docker/`** — Mosquitto, Node-RED, InfluxDB 3, InfluxDB Explorer

## Running the full stack

```bash
# 1. Infrastructure
cd docker && docker compose up -d

# 2. Web dashboard (dev)
cd ui && npm run dev
```

## Sub-directory docs

- [`firmware/CLAUDE.md`](firmware/CLAUDE.md) — build, flash, GPIO, Wokwi simulation
- [`ui/CLAUDE.md`](ui/CLAUDE.md) — Nuxt commands, server architecture, env vars
