# HomeNut

Home automation system for monitoring rooms with temperature, humidity, and camera sensors.

## Structure

```
HomeNut/
├── ui/          # Nuxt 4 web dashboard (frontend + API server)
├── firmware/    # ESP32 PlatformIO projects (sensor & camera)
└── docker/      # Supporting services (MQTT, InfluxDB, Node-RED)
```

## Quick Start

**1. Start the infrastructure:**
```bash
cd docker && docker compose up -d
```

**2. Start the web dashboard:**
```bash
cd ui && npm install && npm run dev
```

**3. Flash firmware** — see [`firmware/README.md`](firmware/README.md)

## Services

| Service | URL | Purpose |
|---|---|---|
| Dashboard | http://localhost:3000 | HomeNut UI |
| InfluxDB | http://localhost:8086 | Time-series data |
| InfluxDB UI | http://localhost:8888 | DB explorer |
| Node-RED | http://localhost:1880 | Flow automation |
| Mosquitto | localhost:1883 | MQTT broker |
