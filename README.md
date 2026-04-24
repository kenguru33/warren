# Warren

Home automation system for monitoring rooms with temperature, humidity, and camera sensors.

## Structure

```
warren/
├── ui/          # Nuxt 4 web dashboard (frontend + API server)
├── firmware/    # ESP32 PlatformIO projects (sensor & camera)
└── docker/      # Supporting services (MQTT, InfluxDB, Node-RED)
```

## Setup from scratch

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose
- [Node.js](https://nodejs.org/) (v20+)
- [PlatformIO](https://platformio.org/) (only needed for flashing firmware)

### 1. InfluxDB admin token

The Docker stack requires a token file before it can start:

```bash
echo "apiv3_my-super-secret-token" > docker/admin.token
```

Use any secret string — this becomes the InfluxDB admin token.

### 2. UI environment

```bash
cp ui/.env.example ui/.env
```

The defaults in `.env.example` match the Docker stack. If you changed the token above, update `INFLUXDB_TOKEN` in `ui/.env` to match.

### 3. Install UI dependencies

```bash
cd ui && npm install
```

### 4. Start the infrastructure

```bash
cd docker && docker compose up -d
```

### 5. Start the web dashboard

```bash
cd ui && npm run dev
```

The dashboard is now available at **http://localhost:3000**.

### 6. Flash firmware (optional)

Only needed if you have ESP32 hardware. Copy and fill in the secrets files:

**Sensor:**
```bash
cp firmware/sensor/include/secrets.h.example firmware/sensor/include/secrets.h
# Edit secrets.h — set SECRET_SSID, SECRET_PASS, MQTT_SERVER, MQTT_USER, MQTT_PASS
```

**Camera:**
```bash
cp firmware/camera/include/secrets.h.example firmware/camera/include/secrets.h
# Edit secrets.h — set SECRET_SSID, SECRET_PASS, BACKEND_URL (e.g. http://192.168.1.x:3000)
```

Then flash with PlatformIO — see [`firmware/README.md`](firmware/README.md) for details.

## Services

| Service | URL | Purpose |
|---|---|---|
| Dashboard | http://localhost:3000 | Warren UI |
| InfluxDB | http://localhost:8086 | Time-series data |
| InfluxDB UI | http://localhost:8888 | DB explorer |
| Node-RED | http://localhost:1880 | Flow automation |
| Mosquitto | localhost:1883 | MQTT broker |
