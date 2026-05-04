# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Two independent PlatformIO/Arduino projects for ESP32 microcontrollers:
- **sensor/** — reads DHT22 temperature/humidity, publishes via MQTT, controls fan/heater relays
- **camera/** — AI Thinker ESP32-CAM: serves MJPEG stream (`/stream`) and JPEG snapshot (`/capture`) over HTTP, announces itself to the Next.js backend on boot

## Build & Flash

```bash
# Sensor project
cd sensor
pio run -e esp-wrover-kit              # build
pio run -e esp-wrover-kit -t upload    # flash
pio device monitor -b 115200           # serial monitor

# Camera project (AI Thinker ESP32-CAM)
cd camera
pio run -e esp32cam
pio run -e esp32cam -t upload
pio device monitor -b 115200
```

## Camera Architecture

`camera/src/main.cpp` starts a single HTTP server on port 80 with two URI handlers:

- **`/stream`** — MJPEG multipart stream (`multipart/x-mixed-replace; boundary=frame`), consumed by `<img src={streamUrl} />` in `nextjs-ui/app/components/warren/live-stream-modal.tsx`
- **`/capture`** — single JPEG snapshot, shown in `nextjs-ui/app/components/warren/camera-tile.tsx`

On boot, after WiFi connects, `announceToBackend()` POSTs to `BACKEND_URL/api/sensors/announce` with the device's IP-based stream/snapshot URLs and a MAC-derived `deviceId`. The Next.js backend writes these to the `sensor_announcements` table in SQLite and they surface in the **Sensors** discovery list alongside ESP32 climate sensors and Hue devices.

**GPIO 4** is the onboard flash LED (initialized LOW/off) — do not repurpose it for other output.

**Secrets:** copy `camera/include/secrets.h.example` → `camera/include/secrets.h` and set `SECRET_SSID`, `SECRET_PASS`, and `BACKEND_URL` (e.g. `https://192.168.1.100` — Caddy fronts the dashboard at :443; the firmware uses `setInsecure()` so the LAN-only self-signed cert is accepted without bundling the local CA).

## Simulation (Wokwi)

Both projects have Wokwi schematics and use `Wokwi-GUEST` WiFi by default in their `secrets.h` files.

- **sensor/** — `diagram.json` wires up DHT22 + relay LEDs; `wokwi.toml` points to `esp-wrover-kit` build output
- **camera/** — `diagram.json` uses `board-esp32-devkit-c-v4` (Wokwi has no ESP32-CAM board type); `wokwi.toml` points to `esp32cam` build output. Camera init will always fail in simulation — no camera hardware exists to simulate.

## IoT Backend Stack

Use the `warren` CLI rather than raw `docker compose` — it generates the secrets, Caddy cert, and Mosquitto password file the firmware connects with.

```bash
cd ../docker
./warren setup    # first time only
./warren start
```

| Service             | LAN address                  | Loopback address      |
|---------------------|------------------------------|-----------------------|
| Warren dashboard    | https://&lt;lan-ip&gt;       | http://localhost:3000 (`--dev`) |
| Mosquitto MQTTS     | mqtts://&lt;lan-ip&gt;:8883  | mqtt://localhost:1883 |
| InfluxDB 3          | —                            | http://localhost:8086 |
| InfluxDB Explorer   | —                            | http://localhost:8888 |
| Node-RED            | —                            | http://localhost:1880 |

Operator-only ports are bound to `127.0.0.1`. Devices speak TLS only: HTTPS for the dashboard via Caddy and MQTTS for the broker. The plaintext `:1883` listener stays inside the Docker bridge network (UI container ↔ broker) and host loopback (dev mode).

## Sensor Architecture

`sensor/src/main.cpp` uses FreeRTOS with three pinned tasks:

- **`taskReadSensor`** (core 1, priority 1) — polls DHT22 at `config.pollInterval` (default 5 s), pushes valid readings into a `QueueHandle_t`
- **`taskMQTT`** (core 0, priority 1) — drains the queue, publishes to `warren/sensors/{deviceId}/temperature` and `warren/sensors/{deviceId}/humidity`, handles reconnection, then applies relay control directly from the published reading
- **`taskFetchConfig`** (core 0, priority 1) — polls `BACKEND_URL/api/sensors/config/{deviceId}` at `config.configFetchInterval` (default 60 s) over HTTPS with `setInsecure()`, updates the shared `SensorConfig` struct and persists changes to NVS. The endpoint is on the `proxy.ts` allowlist so device polls don't need a session cookie.

`loop()` is intentionally empty; all work is done in tasks.

**GPIO assignments (sensor):**
- GPIO 21 — DHT22 data
- GPIO 4 — heater relay
- GPIO 19 — fan relay

**Control logic** runs inside `taskMQTT` immediately after publishing each reading. Heater (GPIO 4) turns ON when temperature ≤ `refTemp − heaterOnOffset`, turns OFF when ≥ `refTemp + heaterOffOffset` (hysteresis in between). Fan (GPIO 19) turns ON when temperature > `refTemp + fanThreshold`. Falls back to hardcoded absolute thresholds (18/22/30 °C) when `config.refTemp` is NAN.

**Runtime config** — the `SensorConfig` struct holds all tunable values. On boot, `loadConfigFromNVS()` restores values from the ESP32 NVS flash (namespace `"cfg"`), so the device operates with the last-known config even without network. `taskFetchConfig` fetches the full config object from the backend and calls `saveConfigToNVS()` only when values change, to minimise flash wear.

## Secrets

Copy `sensor/include/secrets.h.example` to `sensor/include/secrets.h` and fill in `SECRET_SSID`, `SECRET_PASS`, `MQTT_SERVER` (Warren host LAN IP), `MQTT_PORT` (8883 for MQTTS), `MQTT_USER`, `MQTT_PASS`, and `BACKEND_URL` (e.g. `https://192.168.1.100`). `MQTT_PASS` is generated by `warren setup` and written into `nextjs-ui/.env` and `docker/mosquitto/config/`; copy it from there. The file is gitignored.

## Dependencies (sensor)

Declared in `sensor/platformio.ini` and managed by PlatformIO:
- `knolleary/PubSubClient` — MQTT client
- `beegee-tokyo/DHT sensor library for ESPx` — DHT22 driver
- `bblanchon/ArduinoJson` — JSON parsing for config fetch
- `Preferences` — ESP32 NVS key-value storage (part of Arduino core, no declaration needed)
