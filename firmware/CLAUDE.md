# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Two independent PlatformIO/Arduino projects for ESP32 microcontrollers:
- **sensor/** — reads DHT22 temperature/humidity, publishes via MQTT, controls fan/heater relays
- **camera/** — AI Thinker ESP32-CAM: serves MJPEG stream (`/stream`) and JPEG snapshot (`/capture`) over HTTP, announces itself to the Nuxt backend on boot

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

- **`/stream`** — MJPEG multipart stream (`multipart/x-mixed-replace; boundary=frame`), consumed by the Nuxt `<img :src="streamUrl" />` in `LiveStreamModal.vue`
- **`/capture`** — single JPEG snapshot, shown in `CameraCard.vue`

On boot, after WiFi connects, `announceToBackend()` POSTs to `BACKEND_URL/api/sensors/announce` with the device's IP-based stream/snapshot URLs and a MAC-derived `deviceId`. The Nuxt backend stores these in SQLite and they appear in the "Add Sensor" modal under discovered cameras.

**GPIO 4** is the onboard flash LED (initialized LOW/off) — do not repurpose it for other output.

**Secrets:** copy `camera/include/secrets.h.example` → `camera/include/secrets.h` and set `SECRET_SSID`, `SECRET_PASS`, and `BACKEND_URL` (e.g. `http://192.168.1.100:3000`).

## Simulation (Wokwi)

Both projects have Wokwi schematics and use `Wokwi-GUEST` WiFi by default in their `secrets.h` files.

- **sensor/** — `diagram.json` wires up DHT22 + relay LEDs; `wokwi.toml` points to `esp-wrover-kit` build output
- **camera/** — `diagram.json` uses `board-esp32-devkit-c-v4` (Wokwi has no ESP32-CAM board type); `wokwi.toml` points to `esp32cam` build output. Camera init will always fail in simulation — no camera hardware exists to simulate.

## IoT Backend Stack

```bash
cd ../docker
docker compose up -d
```

| Service     | URL / Port         |
|-------------|-------------------|
| InfluxDB    | localhost:8086    |
| InfluxDB UI | localhost:8888    |
| Mosquitto   | localhost:1883    |
| Node-RED    | localhost:1880    |
| Grafana     | localhost:3000    |

## Sensor Architecture

`sensor/src/main.cpp` uses FreeRTOS with three pinned tasks:

- **`taskReadSensor`** (core 1, priority 1) — polls DHT22 at `config.pollInterval` (default 5 s), pushes valid readings into a `QueueHandle_t`
- **`taskMQTT`** (core 0, priority 1) — drains the queue, publishes to `warren/sensors/{deviceId}/temperature` and `warren/sensors/{deviceId}/humidity`, handles reconnection, then applies relay control directly from the published reading
- **`taskFetchConfig`** (core 0, priority 1) — polls `BACKEND_URL/api/sensors/config/{deviceId}` at `config.configFetchInterval` (default 60 s), updates the shared `SensorConfig` struct and persists changes to NVS

`loop()` is intentionally empty; all work is done in tasks.

**GPIO assignments (sensor):**
- GPIO 21 — DHT22 data
- GPIO 4 — heater relay
- GPIO 19 — fan relay

**Control logic** runs inside `taskMQTT` immediately after publishing each reading. Heater (GPIO 4) turns ON when temperature ≤ `refTemp − heaterOnOffset`, turns OFF when ≥ `refTemp + heaterOffOffset` (hysteresis in between). Fan (GPIO 19) turns ON when temperature > `refTemp + fanThreshold`. Falls back to hardcoded absolute thresholds (18/22/30 °C) when `config.refTemp` is NAN.

**Runtime config** — the `SensorConfig` struct holds all tunable values. On boot, `loadConfigFromNVS()` restores values from the ESP32 NVS flash (namespace `"cfg"`), so the device operates with the last-known config even without network. `taskFetchConfig` fetches the full config object from the backend and calls `saveConfigToNVS()` only when values change, to minimise flash wear.

## Secrets

Copy `sensor/include/secrets.h.example` to `sensor/include/secrets.h` and fill in `SECRET_SSID`, `SECRET_PASS`, `MQTT_SERVER`, `MQTT_USER`, `MQTT_PASS`, `BACKEND_URL`. The file is gitignored.

## Dependencies (sensor)

Declared in `sensor/platformio.ini` and managed by PlatformIO:
- `knolleary/PubSubClient` — MQTT client
- `beegee-tokyo/DHT sensor library for ESPx` — DHT22 driver
- `bblanchon/ArduinoJson` — JSON parsing for config fetch
- `Preferences` — ESP32 NVS key-value storage (part of Arduino core, no declaration needed)
