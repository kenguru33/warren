# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at localhost:3000
npm run build        # Build for production
npm run generate     # Generate static site
npm run preview      # Preview production build
```

## Architecture

This is a **Nuxt 4** project (not Nuxt 3). Key differences from Nuxt 3: the app source directory is `app/` instead of root-level `pages/`, `components/`, etc.

- `app/app.vue` — root Vue component
- `nuxt.config.ts` — minimal config; devtools enabled
- TypeScript is fully managed by Nuxt via `.nuxt/tsconfig.*.json`; the root `tsconfig.json` only holds project references to those generated files

Standard Nuxt conventions apply: file-based routing under `app/pages/`, auto-imported components from `app/components/`, composables from `app/composables/`, server routes under `server/`.

## Infrastructure (Docker)

`../docker/docker-compose.yml` defines the supporting services stack (lives at project root):

| Service | Image | Port | Purpose |
|---|---|---|---|
| influxdb3 | influxdb:3-core | 8086 | Time-series database |
| influxdb3-explorer | influxdata/influxdb3-ui | 8888/8889 | InfluxDB admin UI |
| nodered | nodered/node-red | 1880 | Flow-based automation |
| mosquitto | eclipse-mosquitto:2 | 1883 | MQTT broker |

```bash
cd ../docker && docker compose up -d   # Start all services
cd ../docker && docker compose down    # Stop all services
```

- `../docker/admin.token` — InfluxDB admin token (not committed)
- `../docker/mosquitto/config/` — Mosquitto config and password file
