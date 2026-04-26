# docker/CLAUDE.md

Docker infrastructure for Warren. All lifecycle management goes through the `warren` CLI script at `docker/warren`.

## warren CLI

```bash
./docker/warren setup          # First-time init: generate secrets, build UI
./docker/warren setup --force  # Regenerate secrets without prompting

./docker/warren start          # Start infrastructure + UI (production)
./docker/warren start --dev    # Start infrastructure + Nuxt dev server

./docker/warren stop           # Stop UI and all containers (data preserved)
./docker/warren restart        # Full stop + start
./docker/warren restart <svc>  # Restart one Docker Compose service (e.g. mosquitto)

./docker/warren clear          # DESTRUCTIVE: wipe all data, secrets, volumes (requires "YES")
```

`setup` generates: `admin.token`, `mosquitto/config/passwordfile`, `mosquitto/config/mosquitto.conf`, `nodered/flows.json` (with InfluxDB token injected), `ui/.env`, and both `firmware/*/include/secrets.h` files.

## Services

| Service | Container | Port | Purpose |
|---|---|---|---|
| Mosquitto | `mosquitto` | 1883 (auth), 1884 (anon) | MQTT broker |
| Node-RED | `node-red` | 1880 | MQTT → InfluxDB pipeline |
| InfluxDB 3 | `influxdb3` | 8086 | Time-series data store |
| InfluxDB Explorer | `influxdb3-explorer` | 8888 | Web query UI |

## Data flow

```
ESP32 sensors  →  Mosquitto :1883 (auth)
Node-RED       →  Mosquitto :1884 (anonymous, internal)
Node-RED       →  InfluxDB  :8086  (line protocol, bucket: warren)
Nuxt UI        →  InfluxDB  :8086  (SQL queries)
```

Node-RED subscribes to `warren/sensors/+/+` and writes `sensor_readings` measurements. The anonymous listener (1884) avoids storing MQTT credentials in Node-RED config.

## Key files

- `admin.token` — InfluxDB admin token (JSON, git-ignored, created by setup)
- `mosquitto/config/mosquitto.conf` — broker config (git-ignored)
- `mosquitto/config/passwordfile` — hashed MQTT credentials (git-ignored)
- `nodered/flows.json` — flow definitions; reset to git-tracked default by `warren clear`

## Tests

```bash
cd docker && ./tests/run_tests.sh
```

Tests cover setup, start/stop, restart, and clear. Assertions live in `tests/lib/assert.sh`.
