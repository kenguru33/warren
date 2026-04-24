# Warren

Home automation dashboard built with Nuxt 4. Tracks temperature, humidity, and motion sensors per room. Sensor readings are stored in InfluxDB; room and sensor configuration is stored in SQLite.

## Architecture

```
Sensors → MQTT (Mosquitto :1883)
             ↓
          Node-RED (:1880)  ←→  InfluxDB 3 (:8086)
                                      ↓
                              Nuxt app (:3000)
                              Grafana (:3001)
```

## Prerequisites

- Node.js 20+
- Docker + Docker Compose

---

## 1. Clone and install dependencies

```bash
git clone <repo-url>
cd nuxt-app
npm install
```

---

## 2. Start the Docker services

```bash
cd docker
docker compose up -d
```

Services started:

| Service | URL |
|---|---|
| InfluxDB 3 | http://localhost:8086 |
| InfluxDB Explorer (UI) | http://localhost:8888 |
| Node-RED | http://localhost:1880 |
| Mosquitto (MQTT) | localhost:1883 |

---

## 3. Create the InfluxDB database

Run once after the first `docker compose up`:

```bash
docker exec influxdb3 influxdb3 create database warren \
  --token apiv3_my-super-secret-token \
  --host http://localhost:8086
```

You can verify it was created in the Explorer UI at http://localhost:8888.

---

## 4. Configure environment variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

`.env` contents:

```
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=apiv3_my-super-secret-token
INFLUXDB_DATABASE=warren
```

The token value comes from `docker/admin.token`.

---

## 5. Start the development server

```bash
npm run dev
```

App runs at http://localhost:3000.

> **Note:** Grafana is mapped to port 3001 (`docker-compose.yml`) to avoid conflicting with the Nuxt dev server on 3000.

---

## 6. Configure Node-RED (optional)

Open Node-RED at http://localhost:1880 and create flows to:

1. Subscribe to MQTT topics from Mosquitto (`mqtt://mosquitto:1883`)
2. Parse sensor payloads
3. Write readings to InfluxDB (`http://influxdb3:8086`) or POST to the Nuxt API (`http://host.docker.internal:3000/api/sensors/<id>/reading`)

---

## API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/rooms` | All rooms with sensors and latest readings |
| `POST` | `/api/rooms` | Create a room `{ name }` |
| `DELETE` | `/api/rooms/:id` | Delete a room |
| `PUT` | `/api/rooms/:id/reference` | Set reference temp/humidity `{ refTemp, refHumidity }` |
| `POST` | `/api/sensors` | Create a sensor `{ roomId, type, label? }` |
| `DELETE` | `/api/sensors/:id` | Delete a sensor |
| `POST` | `/api/sensors/:id/reading` | Record a reading `{ value, recordedAt? }` |

---

## Development commands

```bash
npm run dev       # Dev server at localhost:3000
npm run build     # Production build
npm run generate  # Static site generation
npm run preview   # Preview production build
```
