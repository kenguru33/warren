<p align="center">
  <img src="assets/logo.svg" alt="Warren" width="300"/>
</p>

<p align="center">
  Self-hosted home monitoring system. Track temperature, humidity, motion, and camera feeds from any room — all from a single dashboard running on your own hardware.
</p>

---

## How it works

```
ESP32 sensors  ──MQTT──▶  Mosquitto  ──▶  Node-RED  ──▶  InfluxDB
                                                              ▲
                                     Warren UI  ◀────────────┘
                                  (Nuxt + SQLite)
```

**Sensors** are ESP32 microcontrollers that read a DHT22 (temperature + humidity) and publish readings every 5 seconds over MQTT. A second ESP32-CAM variant serves a live MJPEG stream and announces itself to the dashboard over HTTP.

**Infrastructure** runs in Docker. Mosquitto brokers MQTT traffic, Node-RED routes sensor readings into InfluxDB, and InfluxDB stores all time-series data.

**The dashboard** is a Nuxt 4 web app that reads live and historical data from InfluxDB, stores room/sensor configuration in SQLite, and lets you set temperature targets that trigger physical heater and fan relays on the sensor hardware.

---

## Requirements

- [Docker](https://docs.docker.com/get-docker/) with Compose
- [Node.js](https://nodejs.org/) 20+ (UI development only)
- [PlatformIO](https://platformio.org/) (firmware flashing only)

---

## Quick start

```bash
git clone https://github.com/your-org/warren.git && cd warren

./docker/warren setup   # generates all secrets and builds the UI
./docker/warren start   # starts infrastructure + dashboard
```

Open **http://localhost:3000** and log in with the credentials printed at the end of `setup`.

---

## Setup in detail

### 1. `warren setup`

Running `./docker/warren setup` does the following automatically:

- Generates a random InfluxDB admin token and writes it to `docker/admin.token`
- Creates `docker/mosquitto/config/mosquitto.conf` and a hashed password file for MQTT
- Injects the InfluxDB token and MQTT credentials into `docker/nodered/flows.json`
- Creates `ui/.env` with all connection strings pre-filled
- Writes `firmware/sensor/include/secrets.h` and `firmware/camera/include/secrets.h` with WiFi, MQTT, and backend URL placeholders

After setup, edit the two `secrets.h` files to add your WiFi credentials and MQTT password before flashing firmware.

```bash
# Re-generate all secrets (e.g. after a compromise):
./docker/warren setup --force
```

### 2. Start and stop

```bash
./docker/warren start          # production mode (pre-built UI)
./docker/warren start --dev    # development mode (Nuxt dev server with HMR)
./docker/warren stop           # graceful shutdown, data preserved
./docker/warren restart        # stop + start
./docker/warren restart nodered  # restart a single Docker service
```

### 3. Wipe everything

```bash
./docker/warren clear   # prompts for "YES" — destroys all data, volumes, and secrets
```

---

## Services

| Service | URL | Purpose |
|---|---|---|
| Warren dashboard | http://localhost:3000 | Main UI |
| InfluxDB Explorer | http://localhost:8888 | Query and browse time-series data |
| Node-RED | http://localhost:1880 | MQTT → InfluxDB pipeline (internal) |
| Mosquitto MQTT | localhost:1883 | Broker for sensor readings (auth required) |

---

## Dashboard walkthrough

### Rooms and sensors

After logging in, create rooms from the dashboard (e.g. "Living Room", "Bedroom"). Then go to **Sensors** to see all discovered devices and assign them to rooms. Sensors appear automatically once they start publishing data — no manual registration needed.

### Reference temperature

Each room can have a target (reference) temperature and humidity. Set these by clicking **Edit** on a room card. The sensor hardware reads this target every 60 seconds and uses it to control the heater and fan relays.

### Sensor configuration

Click the ⚙ gear icon on any temperature sensor card to open its configuration panel:

| Setting | Description | Default |
|---|---|---|
| Target temperature | Overrides the room reference for this device | Room reference |
| Heater ON offset | Turn heater on when temp drops this many °C below target | 2.0 °C |
| Heater OFF offset | Turn heater off when temp rises this many °C above target | 2.0 °C |
| Fan threshold | Turn fan on when temp exceeds target by this many °C | 10.0 °C |
| Sensor poll interval | How often the sensor reads and publishes | 5 s |
| Config fetch interval | How often the sensor checks for updated config | 60 s |

Config is delivered to the device on its next poll — no reflashing required. A "Pending device acknowledgement" badge appears until the device confirms receipt.

### Offline detection

A sensor that has not reported for more than 30 seconds is marked **Offline** — the sensor card and room tile both show a red badge and dimmed value. The indicator clears automatically when the sensor resumes reporting.

### Camera feeds

ESP32-CAM devices announce themselves on boot. Once discovered and assigned to a room, click the camera tile to open a live MJPEG stream. A snapshot thumbnail updates in the room card when the camera is active.

### Sensor history

Click any temperature, humidity, or motion tile in a room card to open a historical chart for that sensor.

---

## Firmware

### Temperature/humidity sensor (`firmware/sensor`)

The sensor firmware runs three FreeRTOS tasks:

| Task | Core | Responsibility |
|---|---|---|
| `taskReadSensor` | 1 | Polls DHT22 at `pollInterval`, queues valid readings |
| `taskMQTT` | 0 | Publishes readings to MQTT, applies relay control |
| `taskFetchConfig` | 0 | Fetches config from backend at `configFetchInterval` |

**GPIO pins:**
- GPIO 21 — DHT22 data
- GPIO 4 — heater relay
- GPIO 19 — fan relay

**MQTT topics:** `warren/sensors/{deviceId}/temperature` and `.../humidity`

**Device ID** is derived from the MAC address as `esp32-{last3octets}` (e.g. `esp32-a1b2c3`). The Wokwi simulator uses the fixed ID `wokwi-sensor`.

**Configuration persistence:** config is stored in ESP32 NVS flash (namespace `cfg`) so the device runs with its last-known settings across reboots, even without network.

#### Build and flash

```bash
cd firmware/sensor
cp include/secrets.h.example include/secrets.h
# Fill in SECRET_SSID, SECRET_PASS, MQTT_SERVER, MQTT_USER, MQTT_PASS, BACKEND_URL

pio run -e esp-wrover-kit -t upload
pio device monitor -b 115200
```

#### Simulate with Wokwi

Open the `firmware/sensor` folder in VS Code with the Wokwi extension. The schematic (`diagram.json`) wires a DHT22 and two relay LEDs. The simulator connects to `Wokwi-GUEST` WiFi and uses the fixed device ID `wokwi-sensor`. If your backend is running on `localhost:3000`, set `BACKEND_URL=http://localhost:3000` in `secrets.h` before building.

---

### Camera (`firmware/camera`)

The ESP32-CAM firmware starts an HTTP server on port 80 with two endpoints:

- **`/stream`** — MJPEG multipart stream, consumed by the dashboard live view
- **`/capture`** — single JPEG snapshot, shown as the room tile thumbnail

On boot, the camera POSTs its stream and snapshot URLs to `/api/sensors/announce` on the backend. It then appears in the **Sensors** discovery list, ready to be assigned to a room.

#### Build and flash

```bash
cd firmware/camera
cp include/secrets.h.example include/secrets.h
# Fill in SECRET_SSID, SECRET_PASS, BACKEND_URL (e.g. http://192.168.1.x:3000)

pio run -e esp32cam -t upload
```

> **Note:** GPIO 4 on the ESP32-CAM is the onboard flash LED. Do not use it as a relay output.

---

## Development

### Run the UI locally

The Docker infrastructure must already be running (`./docker/warren start --dev` handles this, or start it separately with `docker compose up -d` in `docker/`).

```bash
cd ui
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

### Run Docker tests

```bash
cd docker && ./tests/run_tests.sh
```

### Adding a feature

Features follow a spec → plan → implement workflow. Spec files live in `_specs/` (use `_specs/template.md` as the template). Implementation goes on a `claude/feature/<slug>` branch.
