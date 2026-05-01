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

### Shared code

`shared/types.ts` and `shared/utils/*.ts` are imported by both `app/` (client) and `server/` code. Cross-tier types and helpers belong here, not duplicated on either side. `shared/utils/light-themes.ts` exports the `LIGHT_THEMES` map + `LightThemeKey` type (the source of truth — unknown keys crash `LightThemePicker.vue`) and `hexToXy()` for Hue color conversion.

### Server subsystems

Beyond the obvious sensor/room CRUD, two background subsystems live under `server/`:

- **MQTT** — `server/plugins/mqtt.ts` opens a long-lived connection to Mosquitto on startup and subscribes to `warren/sensors/+/announce` for camera self-registration.
- **Hue Bridge** — `server/plugins/hue.ts` boots `hueRuntime` (in `server/utils/hue-runtime.ts`), a 10s poller that upserts `hue_devices` + `hue_light_state` and writes Hue motion/lightlevel readings into the same `sensor_readings` InfluxDB measurement as ESP32 sensors. API endpoints in `server/api/integrations/hue/` and `server/api/light-groups/`. `server/utils/light-groups.ts:fanOutLightCommand` is the shared fan-out helper used by per-group state and the global `/api/lights/master-state` endpoints.

### Auth middleware

All `/api/*` routes require a session except a small allowlist in `server/middleware/01.auth.ts` (`PUBLIC_EXACT`, `PUBLIC_PREFIXES`, `PUBLIC_PATTERNS`). New device-facing endpoints (anything an ESP32 calls without a browser cookie) must be added to one of those lists.

### Styling

- Tailwind v4 with CSS-first config in `app/assets/css/main.css` (no `tailwind.config.js`). The plugin is `@tailwindcss/vite`, wired in `nuxt.config.ts`.
- Components use **Catalyst** patterns (Tailwind UI's design system), implemented in Vue via Headless UI Vue + Heroicons.
- Use **semantic color tokens** (`bg-surface`, `bg-surface-2`, `bg-default`, `bg-modal`, `text-text`, `text-subtle`, `text-muted`, `ring-default`, `bg-accent-soft`, `text-accent-strong`) — they remap per `data-scheme` attribute, which is how the six color schemes work. Don't hardcode `bg-zinc-900` etc. unless you mean it specifically.
- The inline `themeBootstrapScript` in `nuxt.config.ts` reads `localStorage warren:theme` (`light`/`dark`) and `warren:scheme` and applies them to `<html>` before first paint to avoid theme flash.
- For controls that auto-hide on hover (e.g. tile edit buttons), use Tailwind v4's `pointer-fine:` variant — plain `group-hover` makes them invisible on touch devices.

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
