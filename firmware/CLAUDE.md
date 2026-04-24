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

`sensor/src/main.cpp` uses FreeRTOS with two pinned tasks:

- **`taskReadSensor`** (core 1, priority 1) — polls DHT22 every 5 s, pushes valid readings into a `QueueHandle_t`
- **`taskMQTT`** (core 0, priority 1) — drains the queue, publishes to `warren/sensors/{deviceId}/temperature` and `warren/sensors/{deviceId}/humidity`, handles reconnection

`loop()` is intentionally empty; all work is done in tasks.

**GPIO assignments (sensor):**
- GPIO 21 — DHT22 data
- GPIO 4 — fan relay
- GPIO 19 — heater relay

**Control logic** lives in `mqttCallback`: subscribes to `home/temperature` and adjusts relay states around the room's target temperature (heater ON when < target − 2 °C, heater OFF when > target + 2 °C, fan ON when > target + 10 °C). Falls back to hardcoded thresholds (18/22/30 °C) when no target is available.

**Target fetch** — a third task `taskFetchTarget` (core 0) polls `BACKEND_URL/api/sensors/target/{deviceId}` every 60 s and updates the shared `targetTemp` used by the control logic. Unknown/unassigned device or `refTemp: null` resets it to `NAN` (fallback).

## Secrets

Copy `sensor/include/secrets.h.example` to `sensor/include/secrets.h` and fill in `SECRET_SSID`, `SECRET_PASS`, `MQTT_SERVER`, `MQTT_USER`, `MQTT_PASS`, `BACKEND_URL`. The file is gitignored.

## Dependencies (sensor)

Declared in `sensor/platformio.ini` and managed by PlatformIO:
- `knolleary/PubSubClient` — MQTT client
- `beegee-tokyo/DHT sensor library for ESPx` — DHT22 driver
- `bblanchon/ArduinoJson` — JSON parsing for backend target fetch
