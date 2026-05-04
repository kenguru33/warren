<p align="center">
  <img src="assets/logo.svg" alt="Warren" width="300"/>
</p>

<p align="center">
  Self-hosted home monitoring and control. Track temperature, humidity, motion, and camera feeds, and drive Philips Hue lights and physical heater/fan relays — all from a single dashboard running on your own hardware.
</p>

---

## How it works

```
ESP32 sensors  ──MQTT──▶  Mosquitto  ──▶  Node-RED  ──▶  InfluxDB
                                                              ▲
Philips Hue Bridge  ──HTTP poller──┐                          │
ESP32-CAM (MJPEG/HTTP)  ───────────┤                          │
                                   ▼                          │
                              Warren UI  ◀──────────────────┘
                          (Next.js 16 + SQLite)
```

- **ESP32 sensors** read a DHT22 (temperature + humidity) and publish over MQTT every 5 s. The same firmware drives heater and fan relays based on a target temperature delivered from the backend.
- **ESP32-CAM** units serve a live MJPEG stream and a JPEG snapshot, and announce themselves to the dashboard on boot.
- **Philips Hue Bridge** is a first-class integration. The backend pairs with a bridge, polls every 10 s, caches device state in SQLite, and writes Hue motion / light-level readings into the same time-series pipeline as ESP32 sensors.
- **Mosquitto + Node-RED + InfluxDB 3** run in Docker. Node-RED routes MQTT readings into InfluxDB; the UI reads live and historical data back from InfluxDB via SQL.
- **The dashboard** is a Next.js 16 web app that stores room/sensor/light configuration in SQLite, exposes a REST API, manages auth via sealed-cookie sessions, and runs a long-lived MQTT subscriber and Hue poller from `instrumentation.ts`.

---

## Features

- **Rooms.** Group sensors, cameras, and lights by physical room. Each room can have a target temperature and humidity that drives heater/fan control.
- **Temperature & humidity history.** Click any tile in a room card to open a historical chart drawn from InfluxDB.
- **Heater and fan control with hysteresis.** Each sensor toggles a heater relay below `target − heaterOnOffset` and a fan relay above `target + fanThreshold`. Per-sensor offsets are tunable from the UI and pushed to the device on its next config-fetch poll — no reflashing.
- **Live camera streams.** ESP32-CAM tiles open a full-screen MJPEG view; a snapshot updates inline on the room card.
- **Philips Hue control.** Pair a bridge, then control individual lights, group lights per room, or hit a master on/off across the whole house. Color and brightness are persisted; theme presets paint multiple lights at once.
- **Light groups.** Combine multiple lights (Hue or otherwise) into one tile. Commands fan out in parallel; partial failures are reported.
- **Light themes.** A palette of presets (`amber`, `emerald`, `rose`, `indigo`, `teal`, `plum`, `terracotta`, `catppuccin`, `tokyoNight`, `dracula`, `nord`, `gruvbox`, …) maps to per-light colors.
- **Sensor discovery.** New devices show up automatically — no manual registration. The discovery list merges three sources: InfluxDB readings without an assignment, MQTT/HTTP boot announcements, and previously-assigned sensors that have been removed from a room. Unwanted devices can be blocked.
- **Offline detection.** Sensors that haven't reported for 30 s are flagged with a red badge on both the sensor card and the room tile, and clear automatically when readings resume.
- **Six color schemes + dark/light.** Theme picker swaps semantic CSS tokens via a `data-scheme` attribute. Bootstrap script in the layout applies the choice before first paint to avoid FOUC.
- **PWA.** Installable on mobile (manifest + service worker), with touch-friendly controls (the auto-hide hover affordances stay visible on touch devices).
- **Authenticated API.** All `/api/*` routes are gated by an `iron-session` cookie except a small allowlist for ESP32 device endpoints.

---

## Tech stack

| Layer | Tech |
|---|---|
| Dashboard / API | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Tailwind Plus Catalyst, Headless UI, Heroicons, SWR |
| App state | SQLite via `better-sqlite3` |
| Time-series | InfluxDB 3 (queried with SQL) |
| Messaging | Mosquitto MQTT broker, Node-RED ingest pipeline |
| Auth | `iron-session` sealed cookies |
| Smart-home | Philips Hue Bridge (HTTPS API v2), 10-second poller in-process |
| Sensor firmware | ESP32 + PlatformIO + Arduino framework, FreeRTOS tasks, NVS-persisted config, `PubSubClient` MQTT, DHT22 driver |
| Camera firmware | ESP32-CAM (AI Thinker), `esp32-camera` HTTP server, MJPEG + JPEG endpoints |
| Infrastructure | Docker Compose for Mosquitto, Node-RED, InfluxDB 3, InfluxDB Explorer; managed by the `warren` CLI |
| Testing | Playwright E2E in `nextjs-ui/tests/e2e/`, shell-based Docker integration tests in `docker/tests/` |

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

Open **https://&lt;your-lan-ip&gt;** (printed at the end of `setup`) and log in with the credentials you set during setup. On first visit, install the local CA from `http://<your-lan-ip>/ca.crt` so the dashboard validates without browser warnings.

---

## Setup in detail

### 1. `warren setup`

Running `./docker/warren setup` does the following automatically:

- Generates a random InfluxDB admin token and writes it to `docker/admin.token`
- Creates `docker/mosquitto/config/mosquitto.conf` and a hashed password file for MQTT
- Injects the InfluxDB token and MQTT credentials into `docker/nodered/flows.json`
- Creates `nextjs-ui/.env` with all connection strings and an `iron-session` sealing password pre-filled
- Writes `firmware/sensor/include/secrets.h` and `firmware/camera/include/secrets.h` with WiFi, MQTT, and backend URL placeholders
- Installs and builds the Next.js app

After setup, edit the two `secrets.h` files to add your WiFi credentials and MQTT password before flashing firmware.

```bash
# Re-generate all secrets (e.g. after a compromise):
./docker/warren setup --force
```

### 2. Start and stop

```bash
./docker/warren start          # production mode (pre-built UI)
./docker/warren start --dev    # development mode (Next.js dev server with HMR)
./docker/warren stop           # graceful shutdown, data preserved
./docker/warren restart        # full stop + start
./docker/warren restart nodered  # restart a single Docker service
```

### 3. Wipe everything

```bash
./docker/warren clear   # prompts for "YES" — destroys all data, volumes, and secrets
```

---

## Accessing Warren on your LAN

A Caddy reverse proxy in front of the dashboard terminates TLS so every device on your LAN reaches Warren over HTTPS. **TLS at the edge AND on the wire** — every LAN-reachable port speaks TLS:

- `:443` — Caddy serves the dashboard over HTTPS.
- `:8883` — Mosquitto's MQTTS listener for ESP32 sensors.
- `:80` — plaintext, but only used for the one-time `/ca.crt` download and a 308 redirect to HTTPS.

Plaintext is confined to the Docker bridge network (Caddy ↔ UI container, UI ↔ Mosquitto/InfluxDB, Node-RED) and host loopback (`127.0.0.1`-only operator ports for InfluxDB / Node-RED / InfluxDB Explorer).

### Two TLS modes

`warren setup` asks once which one you want:

**1. Local CA (default)** — `warren setup` generates a self-signed CA + leaf cert with your host's LAN IP as a SubjectAltName. Fully offline; no DNS / mDNS lookup machinery involved by default. Each device installs the CA once.

```
Use a public domain with Let's Encrypt for an officially-trusted cert? [y/N]: n

Optional: add a custom hostname to the cert (e.g. warren.lan, warren.local,
dashboard.home). The cert will cover both the IP and the name. You're
responsible for making the name resolve on each device — via your router's
DNS, /etc/hosts, mDNS, etc. Leave empty to use the IP only.
Add a custom hostname? [y/N]: n
  → Local CA. Dashboard URL: https://192.168.80.60
    Tip: reserve this IP on your router (DHCP reservation) so it doesn't change.
```

URLs to bookmark:
- `https://<your-host-ip>` — the LAN IP setup detected. Always works, no resolution dance.
- `https://<your-hostname>` — only if you opted in to a custom hostname. **Resolution is your problem**: you make the name point at the LAN IP via your router's DNS, a `/etc/hosts` entry on each device, an Avahi alias, or whatever fits your network. The cert will validate either way (it covers both).
- `http://localhost:3000` — direct host access in `--dev` mode (host loopback only, never the LAN).

> **Why is the hostname optional, not auto-detected?** Earlier iterations auto-published `<hostname>.local` via Avahi. That falls over with multiple hosts sharing a kernel hostname (Avahi auto-renames to `<hostname>-2.local`), with hosts that don't run Avahi, and with Docker Desktop / rootless setups where mDNS broadcasts can't reach the LAN. The LAN IP always works; a custom hostname is offered for users who want a prettier URL and have their own resolution story. If your DHCP IP changes, re-run `warren setup --force` to reissue the cert.

**2. Let's Encrypt (opt-in)** — publicly-trusted cert via the DNS-01 challenge. No per-device install needed.

```
Use a public domain with Let's Encrypt? [y/N]: y
  Domain (e.g. warren.example.com): warren.bernt.dev
  ACME contact email: bernt@example.com
  DNS provider [cloudflare]: cloudflare
  DNS provider API token: ********
```

Requires:
- A public domain you own.
- A DNS provider with API access (default supported: Cloudflare; override with `WARREN_CADDY_DNS_PLUGIN=github.com/caddy-dns/<provider>` for Route53, DigitalOcean, etc.).
- An A record for the domain pointing at your *private* LAN IP — public DNS resolves it, but only on-LAN clients can connect. The cert is still trusted everywhere because Let's Encrypt cares about DNS control, not IP reachability.

### Trust the local CA (one-time per device, local-CA mode only)

Open **`http://<your-host-ip>/ca.crt`** in the device's browser to download the trust certificate, then:

| Platform | Steps |
|---|---|
| **iOS / iPadOS** | Settings → General → VPN & Device Management → Install profile, then Settings → General → About → Certificate Trust Settings → enable Warren CA |
| **Android** | Settings → Security → Encryption & credentials → Install from storage → CA certificate |
| **macOS** | Double-click → Keychain Access → File → Import Items → set "Always Trust" |
| **Windows** | Double-click → Install Certificate → Local Machine → "Trusted Root Certification Authorities" |
| **Linux (Firefox)** | Preferences → Privacy & Security → Certificates → Import |
| **Linux (Chrome)** | `chrome://settings/certificates` → Authorities → Import |

The cert file also lives at `docker/tls/ca.crt` for power users.

### Host prerequisites

Before `warren setup`, make sure these are in place — `setup` pre-flights both and refuses to continue with actionable errors if they're missing:

**Rootless Docker** (modern Fedora / Ubuntu default): allow rootless processes to bind privileged ports.

```bash
echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/99-warren.conf
sudo sysctl --load /etc/sysctl.d/99-warren.conf
```

**Fedora / RHEL firewalld**: open ports 80 and 443 in your default zone.

```bash
sudo firewall-cmd --permanent --zone=FedoraWorkstation --add-service=http --add-service=https
sudo firewall-cmd --reload
```

### Dev mode

- `warren start --dev` runs `next dev` as a host process at `http://localhost:3000` — no Caddy, no UI container. Plaintext is OK in dev because it's never on the LAN. The Mosquitto and InfluxDB host ports are bound to `127.0.0.1`, so the dev process reaches them via loopback exactly like the prod container reaches them via the bridge network.
- `warren start --dev --proxy` brings Caddy up in front of `next dev` for LAN HTTPS testing. HMR's WebSocket requires the CA installed in your dev browser.
- **Production needs rootful Docker.** The `ui` Compose service publishes its DNS name on the bridge network so Caddy can reach it without a host port. Rootless Docker breaks `host.docker.internal` reverse-proxy behaviour for `--dev --proxy`; use rootful for any production-shaped run.

### Known LAN-security gaps (separate follow-up spec)

The remaining gap after this iteration:

- The three device-facing endpoints (`/api/sensors/announce`, `/api/sensors/config/{id}`, `/api/sensors/{id}/reading`) accept any LAN client over HTTPS. Per-device authentication is still missing — a malicious device on the LAN could spoof readings. Fix: per-device shared-secret HMAC (separate spec).

---

## Services

| Service | URL | Reachable from | Purpose |
|---|---|---|---|
| Warren dashboard | https://&lt;lan-ip&gt; | LAN (TLS) | Main UI, served by Caddy |
| Warren dashboard (dev) | http://localhost:3000 | host loopback | `warren start --dev` only |
| Mosquitto MQTTS | mqtts://&lt;lan-ip&gt;:8883 | LAN (TLS) | Broker for ESP32 sensors |
| Mosquitto plaintext | mqtt://localhost:1883 | host loopback | UI container + dev-mode UI |
| InfluxDB | http://localhost:8086 | host loopback | SQL queries (operator / dev) |
| InfluxDB Explorer | http://localhost:8888 | host loopback | Time-series browser |
| Node-RED | http://localhost:1880 | host loopback | MQTT → InfluxDB pipeline editor |

---

## Dashboard walkthrough

### Rooms and sensors

After logging in, create rooms from the dashboard (e.g. "Living Room", "Bedroom"). Then go to **Sensors** to see all discovered devices and assign them to rooms. Sensors appear automatically once they start publishing data — no manual registration needed. Unwanted devices can be blocked from the same view.

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

### Lights

The **Lights** page lists every Hue light the bridge knows about, plus any non-Hue lights you've registered. Toggle individual lights, change color or brightness, apply a theme to multiple lights at once, or hit the master switch to turn everything in the house on or off.

### Hue setup

Open **Integrations → Hue**, press the physical button on your bridge, and click **Pair**. The backend stores the application key, syncs the device list, and starts polling. Hue lights and motion/light-level sensors appear in the discovery list alongside ESP32 devices, and Hue sensor readings flow into the same InfluxDB measurement so they share the history pipeline.

### Camera feeds

ESP32-CAM devices announce themselves on boot. Once discovered and assigned to a room, click the camera tile to open a live MJPEG stream. A snapshot thumbnail updates in the room card when the camera is active.

### Sensor history

Click any temperature, humidity, or motion tile in a room card to open a historical chart for that sensor.

### Theming

The user menu has a scheme picker (six palettes) and a light/dark toggle. Choices are persisted to `localStorage` and applied before first paint by an inline bootstrap script.

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

**TLS:** the firmware uses MQTTS (`:8883`) and HTTPS for the config fetch, both with `setInsecure()` — sensors trust whatever cert the broker / Caddy presents. The LAN itself is the trust boundary; this avoids having to install the local CA on every microcontroller.

#### Build and flash

```bash
cd firmware/sensor
cp include/secrets.h.example include/secrets.h
# Fill in SECRET_SSID, SECRET_PASS, MQTT_SERVER, MQTT_PORT, MQTT_USER,
# MQTT_PASS, BACKEND_URL (https://<lan-ip>)

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
# Fill in SECRET_SSID, SECRET_PASS, BACKEND_URL (https://<lan-ip>)

pio run -e esp32cam -t upload
```

> **Note:** GPIO 4 on the ESP32-CAM is the onboard flash LED. Do not use it as a relay output.

---

## Development

### Run the UI locally

The Docker infrastructure must already be running (`./docker/warren start --dev` handles this, or start it separately with `docker compose up -d` in `docker/`).

```bash
cd nextjs-ui
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm run lint         # ESLint
npm run test:e2e     # Playwright E2E suite (auto-starts a dev server)
npm run test:e2e:headed             # …with a visible browser
npx playwright test tests/e2e/<file>.spec.ts   # run a single spec
```

Set `WARREN_BASE_URL=http://localhost:3000` to point Playwright at an already-running dev server instead of letting it spawn one.

### Run Docker tests

```bash
cd docker && ./tests/run_tests.sh
```

### Adding a feature

Features follow a spec → plan → implement workflow. Spec files live in `_specs/` (use `_specs/template.md` as the template). Implementation goes on a `claude/feature/<slug>` branch.
