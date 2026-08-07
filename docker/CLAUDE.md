# docker/CLAUDE.md

Docker infrastructure for Warren. All lifecycle management goes through the `warren` CLI script at `docker/warren`.

## warren CLI

```bash
./docker/warren setup          # First-time init: generate secrets, install UI deps
./docker/warren setup --force  # Regenerate secrets without prompting

./docker/warren start          # Start infrastructure + UI container (production)
./docker/warren start --dev    # Start infrastructure + host-side Next.js dev server
./docker/warren start --dev --proxy  # Plus Caddy in front for LAN-HTTPS-in-dev

./docker/warren stop           # Stop UI and all containers (data preserved)
./docker/warren restart        # Full stop + start
./docker/warren restart <svc>  # Restart one Docker Compose service (e.g. mosquitto)

./docker/warren clear          # DESTRUCTIVE: wipe all data, secrets, volumes (requires "YES")
```

In production, the Next.js UI runs as a Compose service (`warren-ui`, gated by the `ui` profile). The image is built from `nextjs-ui/Dockerfile` on the first `warren start` (and rebuilt on subsequent starts via `up --build`). In dev mode the UI runs as a host process.

`setup` generates: `admin.token`, `mosquitto/config/passwordfile`, `mosquitto/config/mosquitto.conf` (now with an MQTTS listener on `:8883`), `nodered/flows.json` (with InfluxDB token injected), `nextjs-ui/.env`, and both `firmware/*/include/secrets.h` files (with `MQTT_PORT 8883` and `BACKEND_URL https://<lan-ip>`).

## Services

| Service | Container | Host port | Bind address | Profile | Purpose |
|---|---|---|---|---|---|
| Mosquitto | `mosquitto` | 1883 | 127.0.0.1 | always | Plaintext for UI container + dev-host loopback |
| Mosquitto (TLS) | `mosquitto` | 8883 | 0.0.0.0 | always | MQTTS — LAN-reachable for ESP32 sensors |
| Node-RED | `node-red` | 1880 | 127.0.0.1 | always | Operator-only flow editor |
| InfluxDB 3 | `influxdb3` | 8086 | 127.0.0.1 | always | Time-series store; UI uses bridge net |
| InfluxDB Explorer | `influxdb3-explorer` | 8888, 8889 | 127.0.0.1 | always | Web query UI (operator-only) |
| Warren UI | `warren-ui` | — | — | `ui` | Next.js dashboard, bridge net only |
| Caddy | `caddy` | 80, 443 | 0.0.0.0 | `prod` | Edge HTTPS termination |

Profile dispatch:

- `warren start` → `--profile prod --profile ui` (Caddy + UI container, both bridge-network-resolved).
- `warren start --dev` → no profile. Caddy and UI container stay down; UI runs as a host process on `localhost:3000`. Mosquitto/InfluxDB are reachable on host loopback.
- `warren start --dev --proxy` → `--profile prod` only. Caddy is up but routes to the host-side `next dev` via `host.docker.internal:3000` (overridden in shell env at runtime).

Production requires **rootful Docker** so `host.docker.internal` and the bridge network behave consistently. Setup is OS-agnostic; only the runtime path matters.

### TLS modes

Two cert sources, picked at `warren setup` time:

- **Local CA** (default): `warren setup` generates a self-signed CA + leaf cert via `openssl`, with the host's LAN IP as a SubjectAltName (plus a DNS SAN for `WARREN_HOSTNAME` when set). Caddy serves the static cert files (`tls /etc/caddy/tls/server.crt /etc/caddy/tls/server.key`) on a catch-all `:443` listener. Image: stock `caddy:2.10-alpine`. URL is `https://<lan-ip>` — no Avahi/Bonjour/mDNS dependency. Each LAN device installs the CA once via `http://<lan-ip>/ca.crt`.
- **Let's Encrypt** (opt-in): publicly-trusted cert via DNS-01 challenge. Requires a public domain + DNS provider API token. Image: custom `warren-caddy:latest` built by `setup` from `docker/caddy/Dockerfile` with the chosen `caddy-dns/<provider>` plugin compiled in.

**Bare-IP redirect.** When `WARREN_HOSTNAME` is set, the `:443` block 308-redirects browser traffic from `https://<lan-ip>` to the hostname. This exists for the music tile: YouTube refuses to embed licensed music when the page origin is an IP address (IFrame error `150`), so the dashboard has to be reached by name. Three guards keep it safe, and all three matter:

- It fires only when `WARREN_CANONICAL_HOST` is non-empty. That variable is passed as `${WARREN_HOSTNAME:-}` — deliberately *without* the `warren.local` fallback the `WARREN_HOSTNAME` env uses — so an unnamed deployment never redirects to a name that resolves nowhere.
- It never touches `/api/*`. The ESP32 fleet posts readings and announces to `https://<lan-ip>`; its `HTTPClient` does not follow redirects and cannot resolve mDNS `.local`, so redirecting the API would take the sensors offline.
- It matches on the LAN IP only, so hostname traffic passes straight through.

Reloading the Caddyfile needs `docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile` — the file is a bind mount, so `compose up -d caddy` alone sees no change and does not restart it.

Mode is recorded in `docker/.env` as `WARREN_TLS_MODE=local|letsencrypt` along with mode-specific values (`WARREN_LAN_IP`, `WARREN_DOMAIN`, `WARREN_ACME_EMAIL`, `WARREN_DNS_PROVIDER`, `WARREN_DNS_TOKEN`). Compose substitutes these into the `caddy` service env at parse time, and Caddy resolves `{$VAR}` placeholders in its Caddyfile at config load.

## Data flow

```
ESP32 sensors  →  Mosquitto :8883 MQTTS (auth, LAN)
Node-RED       →  Mosquitto :1884 plaintext (anon, bridge net)
Node-RED       →  InfluxDB  :8086 plaintext (bridge net, bucket: warren)
Next.js UI     →  InfluxDB  :8086 plaintext (bridge net or host loopback)
Next.js UI     →  Mosquitto :1883 plaintext (bridge net or host loopback)
Browser        →  Caddy     :443 HTTPS  →  warren-ui :3000 (bridge net)
```

Node-RED subscribes to `warren/sensors/+/+` and writes `sensor_readings` measurements. The anonymous listener (1884) avoids storing MQTT credentials in Node-RED config; it stays bridge-network-only (no host port).

### Speaker discovery needs link-local access — and `warren start` does not have it

Speaker discovery is multicast: mDNS `_googlecast._tcp` for Cast, SSDP for Sonos. **Docker's default bridge network does not pass multicast**, and `./docker/warren start` runs the UI as the `warren-ui` *container*, so multicast discovery finds nothing in the standard production deployment. Only `warren start --dev`, where the UI is a host process, has link-local access.

The symptom is an empty target list and `[sonos] SSDP discovery unavailable: Error: No players found` in `docker logs warren-ui`.

**Sonos works around it; Cast does not.** Unicast *does* cross the bridge, and Sonos serves its device description on a well-known port (1400), so `lib/server/sonos/discovery.ts` falls back to probing the `WARREN_LAN_IP` subnet when multicast comes up empty. One answer is enough — a Sonos speaker knows its whole household, so `InitializeFromDevice` expands it into the full topology including groups. The scan is throttled to once per ten minutes so a house with no Sonos does not fire 254 probes a minute. `WARREN_LAN_IP` must reach the `ui` service for this to work; without it the fallback would scan Docker's private range instead of the LAN.

Cast has no equivalent — there is no well-known port to probe — so Cast discovery genuinely requires host networking for the UI container or an mDNS reflector.

Both protocols also accept a speaker's IP address directly (`POST /api/music/targets`, with `protocol: "sonos"` for Sonos, which is probed before it is stored). Manually added speakers are never removed by a discovery sweep.

## Key files

- `admin.token` — InfluxDB admin token (JSON, git-ignored, created by setup)
- `mosquitto/config/mosquitto.conf` — broker config (git-ignored)
- `mosquitto/config/passwordfile` — hashed MQTT credentials (git-ignored)
- `nodered/flows.json` — flow definitions (git-ignored, generated from `nodered/flows.json.template` by `warren setup`; reset from the template by `warren clear`)
- `nodered/flows.json.template` — committed default flows with a placeholder InfluxDB token (`apiv3_REPLACE_ME_BY_WARREN_SETUP`) that `warren setup` substitutes
- `caddy/Caddyfile.local.tmpl` / `caddy/Caddyfile.letsencrypt.tmpl` — committed templates; `setup` copies the right one to `caddy/Caddyfile` based on the chosen TLS mode
- `caddy/Caddyfile` — rendered Caddyfile (git-ignored, uses `{$VAR}` env substitution at load)
- `caddy/Dockerfile` — multi-stage Caddy build with `xcaddy` + chosen DNS provider plugin (used only in Let's Encrypt mode)
- `caddy/site/ca.crt` — copy of the local CA cert; served at `http://<lan-ip>/ca.crt` (git-ignored, local mode only)
- `tls/ca.crt` + `tls/ca.key` — local CA generated by `openssl` in `warren setup` (git-ignored, local mode only). 10-year validity. The `.crt` is what users install on devices.
- `tls/server.crt` + `tls/server.key` — leaf cert Caddy serves; covers the LAN IP as a SAN (git-ignored, local mode only). 395-day validity; reissue with `warren setup --force`. Also mounted into the mosquitto container at `/mosquitto/certs/` for the MQTTS listener; `server.key` is `0644` so the non-root container user can read it.
- `.env` — compose-side env file with the WARREN_TLS_* values (git-ignored, owner-read)

## Tests

```bash
cd docker && ./tests/run_tests.sh
```

Tests cover setup, start/stop, restart, and clear. The `tests/test_e2e.sh` runner invokes the Playwright suite in `nextjs-ui/tests/e2e/` against the running stack. Assertions live in `tests/lib/assert.sh`.
