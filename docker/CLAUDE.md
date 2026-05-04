# docker/CLAUDE.md

Docker infrastructure for Warren. All lifecycle management goes through the `warren` CLI script at `docker/warren`.

## warren CLI

```bash
./docker/warren setup          # First-time init: generate secrets, build UI
./docker/warren setup --force  # Regenerate secrets without prompting

./docker/warren start          # Start infrastructure + UI (production)
./docker/warren start --dev    # Start infrastructure + Next.js dev server

./docker/warren stop           # Stop UI and all containers (data preserved)
./docker/warren restart        # Full stop + start
./docker/warren restart <svc>  # Restart one Docker Compose service (e.g. mosquitto)

./docker/warren clear          # DESTRUCTIVE: wipe all data, secrets, volumes (requires "YES")
```

`setup` generates: `admin.token`, `mosquitto/config/passwordfile`, `mosquitto/config/mosquitto.conf`, `nodered/flows.json` (with InfluxDB token injected), `nextjs-ui/.env`, and both `firmware/*/include/secrets.h` files.

## Services

| Service | Container | Port | Purpose |
|---|---|---|---|
| Mosquitto | `mosquitto` | 1883 (auth), 1884 (anon) | MQTT broker |
| Node-RED | `node-red` | 1880 | MQTT → InfluxDB pipeline |
| InfluxDB 3 | `influxdb3` | 8086 | Time-series data store |
| InfluxDB Explorer | `influxdb3-explorer` | 8888 | Web query UI |
| Caddy *(prod profile)* | `caddy` | 80, 443 | Edge reverse proxy + TLS termination |

The `caddy` service is gated by the `prod` Compose profile. `warren start` (production) activates `--profile prod`; `warren start --dev` skips it (UI is direct on `localhost:3000`); `warren start --dev --proxy` activates it for LAN-HTTPS-in-dev testing.

### TLS modes

Two cert sources, picked at `warren setup` time:

- **Local CA** (default): Caddy's built-in local CA issues self-signed certs. Image: stock `caddy:2.10-alpine`. Each LAN device installs the cert once via `http://<host-ip>/ca.crt`.
- **Let's Encrypt** (opt-in): publicly-trusted cert via DNS-01 challenge. Requires a public domain + DNS provider API token. Image: custom `warren-caddy:latest` built by `setup` from `docker/caddy/Dockerfile` with the chosen `caddy-dns/<provider>` plugin compiled in.

Mode is recorded in `docker/.env` as `WARREN_TLS_MODE=local|letsencrypt` along with mode-specific values (`WARREN_HOSTNAME`, `WARREN_DOMAIN`, `WARREN_ACME_EMAIL`, `WARREN_DNS_PROVIDER`, `WARREN_DNS_TOKEN`). Compose substitutes these into the `caddy` service env at parse time, and Caddy resolves `{$VAR}` placeholders in its Caddyfile at config load.

## Data flow

```
ESP32 sensors  →  Mosquitto :1883 (auth)
Node-RED       →  Mosquitto :1884 (anonymous, internal)
Node-RED       →  InfluxDB  :8086  (line protocol, bucket: warren)
Next.js UI     →  InfluxDB  :8086  (SQL queries)
```

Node-RED subscribes to `warren/sensors/+/+` and writes `sensor_readings` measurements. The anonymous listener (1884) avoids storing MQTT credentials in Node-RED config.

## Key files

- `admin.token` — InfluxDB admin token (JSON, git-ignored, created by setup)
- `mosquitto/config/mosquitto.conf` — broker config (git-ignored)
- `mosquitto/config/passwordfile` — hashed MQTT credentials (git-ignored)
- `nodered/flows.json` — flow definitions (git-ignored, generated from `nodered/flows.json.template` by `warren setup`; reset from the template by `warren clear`)
- `nodered/flows.json.template` — committed default flows with a placeholder InfluxDB token (`apiv3_REPLACE_ME_BY_WARREN_SETUP`) that `warren setup` substitutes
- `caddy/Caddyfile.local.tmpl` / `caddy/Caddyfile.letsencrypt.tmpl` — committed templates; `setup` copies the right one to `caddy/Caddyfile` based on the chosen TLS mode
- `caddy/Caddyfile` — rendered Caddyfile (git-ignored, uses `{$VAR}` env substitution at load)
- `caddy/Dockerfile` — multi-stage Caddy build with `xcaddy` + chosen DNS provider plugin (used only in Let's Encrypt mode)
- `caddy/site/ca.crt` — copy of the local-CA root cert; served at `http://<host>/ca.crt` (git-ignored, local mode only)
- `tls/ca.crt` — exported public CA cert for power users / scripting (git-ignored, materialized by `warren setup` in local mode)
- `.env` — compose-side env file with the WARREN_TLS_* values (git-ignored, owner-read)

## Tests

```bash
cd docker && ./tests/run_tests.sh
```

Tests cover setup, start/stop, restart, and clear. The `tests/test_e2e.sh` runner invokes the Playwright suite in `nextjs-ui/tests/e2e/` against the running stack. Assertions live in `tests/lib/assert.sh`.
