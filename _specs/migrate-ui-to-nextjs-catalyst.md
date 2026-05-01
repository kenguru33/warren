# Feature Spec: Migrate UI from Nuxt to Next.js with Tailwind Plus + Catalyst

## Overview

Replace the existing Nuxt 4 dashboard at `ui/` with a Next.js application built on top of the existing `nextjs-ui/` starter, styled with Tailwind CSS v4 and Tailwind Plus's Catalyst component system. The new app must take over every responsibility the current Nuxt app holds today: it is both the user-facing dashboard *and* the REST API used by ESP32 sensors, the camera firmware, and the Hue background poller. The work is done in place inside `nextjs-ui/` — the directory is kept and extended, not renamed or relocated — and the Nuxt app at `ui/` is removed once the new app reaches parity. From cutover on, `nextjs-ui/` is the single, canonical UI tier of the Warren stack.

## Goals

- Deliver a feature-complete Next.js replacement for the Nuxt app at `ui/`, covering every page, API route, background subsystem, and database/InfluxDB integration the current app provides.
- Adopt Tailwind Plus + Catalyst (already scaffolded under `nextjs-ui/app/components/`) as the canonical component system, mapping today's Vue components to their Catalyst equivalents (or new components built in the same style).
- Preserve the existing infrastructure contract — MQTT topics, Mosquitto/Node-RED/InfluxDB services, Hue Bridge polling, ESP32 endpoints — so no firmware or Docker-side change is needed.
- Keep the `warren` CLI workflow (`./docker/warren start`, `start --dev`, `setup`, `restart <svc>`) working unchanged from the operator's perspective; only the underlying UI service technology changes.
- Retire `ui/` cleanly: once the new app reaches parity, the Nuxt directory is removed, and docker-compose, build scripts, CLAUDE.md docs, and `_specs/` references all point at the new app.
- Build the new app inside the existing `nextjs-ui/` starter the user has already scaffolded (Next.js + Catalyst components under `nextjs-ui/app/components/`). Extend that scaffold as needed; do not start a fresh Next.js project elsewhere.
- Ship an end-to-end test harness for the new app (Playwright or equivalent) that exercises the golden-path user flows and the device-facing API contract, so regressions during and after migration are caught automatically.

## Non-Goals

- No changes to ESP32 firmware (`firmware/sensor/`, `firmware/camera/`) — the API surface they call must remain wire-compatible.
- No changes to Mosquitto, Node-RED, InfluxDB 3, or InfluxDB Explorer service configuration.
- No redesign of the dashboard's information architecture — pages, flows, and feature set should match the existing Nuxt app at the moment of cutover. Visual polish comes only from swapping to Catalyst primitives, not from reimagining screens.
- No new product features in this migration. Bugs, papercuts, and quality-of-life improvements are tracked separately and handled in follow-up specs.
- The Nuxt app at `ui/` is not maintained in parallel after cutover; this is a replace, not a coexistence.
- No backwards compatibility for existing browser sessions. Warren is not a released product, so the auth/session shape may change freely between Nuxt and Next.js — users will simply log in again after cutover, and no migration of existing session cookies is required.

## User Stories

- As an operator running `./docker/warren start`, I want the stack to boot the Next.js app on port 3000 with no extra steps, so my muscle memory and runbooks keep working.
- As a developer, I want `./docker/warren start --dev` to run the Next.js dev server with hot reload, so the inner-loop matches today's Nuxt dev experience.
- As a household member opening the dashboard on a phone or tablet, I want every screen I use today (rooms, sensor detail, light groups, Hue setup, login) to be present and behave the same way, so the migration is invisible to me.
- As an ESP32 sensor or camera, I want to keep posting to the same HTTP endpoints with the same payloads and auth rules, so my firmware does not need to change or be reflashed.
- As the Hue Bridge integration, I want the 10-second poller and the time-series writes into InfluxDB to keep working from server startup, so motion and light-level history is uninterrupted.
- As a developer onboarding to the project, I want one UI codebase and one set of CLAUDE.md docs pointing at it, so I am never confused about whether `ui/` or `nextjs-ui/` is canonical.

## Functional Requirements

### Pages and dashboard

- Recreate every page that exists under `ui/app/pages/` in the Next.js app router, including the room dashboard, room detail, sensor detail, light group detail, integrations/Hue setup, login, and any settings/profile screens.
- Match the current Nuxt app's interaction patterns (master switches, per-tile controls, theme picker, light group dialog, sensor cards) using Catalyst components or components built in the same Catalyst style.
- Preserve the six color schemes (`zinc-indigo`, `slate-sky`, `stone-amber`, `neutral-emerald`, `gray-rose`, `zinc-violet`) and light/dark modes, persisted under the same `localStorage` keys (`warren:scheme`, `warren:theme`) so user preferences survive cutover.
- Apply the same pre-paint theme bootstrap (no flash on first load) using the equivalent mechanism in Next.js (e.g. an inline script in the root layout).
- Preserve PWA install behavior currently scaffolded in `ui/` (manifest, service worker, install prompt, iOS install hint) so add-to-home-screen continues to work.

### API surface

- Recreate every server route currently exposed under `ui/server/api/**` in the Next.js app (route handlers under `app/api/**` or the agreed Next.js equivalent), including: auth (`/api/auth/login`, `/api/auth/logout`, `/api/_auth/session`), sensors (announce, config, reading, discovered, blocked, CRUD), rooms, light groups, lights master state, and the Hue integration endpoints under `/api/integrations/hue/**`.
- Preserve the auth middleware contract from `ui/server/middleware/01.auth.ts`: all `/api/*` routes require a session except the documented `PUBLIC_EXACT`, `PUBLIC_PREFIXES`, and `PUBLIC_PATTERNS` allowlists. Device-facing endpoints (sensor announce, sensor config fetch, sensor reading post) must remain reachable without a browser session.
- Preserve request/response shapes byte-for-byte where ESP32 firmware or external services depend on them (sensor reading post, sensor config fetch, sensor announce, camera announce). Internal-only endpoints may be reshaped if it simplifies the Next.js implementation, but only when no external client is affected.

### Background subsystems

- Boot the MQTT subscriber on server start, subscribed to `warren/sensors/+/announce` for camera self-registration, with the same long-lived connection lifecycle as `ui/server/plugins/mqtt.ts`.
- Boot the Hue runtime on server start: the 10-second poller that upserts `hue_devices` + `hue_light_state` and writes Hue motion/light-level readings into the `sensor_readings` InfluxDB measurement, matching `ui/server/plugins/hue.ts` and `ui/server/utils/hue-runtime.ts`.
- Ensure both subsystems start exactly once per server process, survive hot reload in dev without leaking connections, and shut down cleanly on process exit.

### Data layer

- Reuse the existing SQLite database file produced by `ui/`. The Next.js app must open the same DB (same path, same schema) so that rooms, sensors, light groups, Hue config, and user accounts carry over without a manual data migration step.
- Keep the `initDb()` semantics: `CREATE TABLE IF NOT EXISTS` on startup, and shadow-table migrations for column changes that SQLite cannot do via `ALTER TABLE`. The schema does not change as part of this migration.
- Reuse the InfluxDB integration contract: `queryInflux(sql)` against the `warren` bucket, returning `[]` when a measurement does not exist yet.
- Preserve the timestamp conventions table from the root CLAUDE.md (SQLite ms ints, InfluxDB ns bigints, JS `Date.now()` ms) and the shared `toMs()` helper that converts between them.

### Cross-tier code

- Port the contents of `ui/shared/types.ts` and `ui/shared/utils/*` into the Next.js project, keeping a single source of truth for cross-tier types and helpers so the same modules are imported by both client components and route handlers.
- The `LIGHT_THEMES` map and `LightThemeKey` type from `ui/shared/utils/light-themes.ts` remain the canonical theme registry; `hexToXy()` remains the canonical Hue color converter.

### Build, run, and Docker integration

- Update `docker/docker-compose.yml` (and any related Dockerfile under `docker/`) so the UI service builds and runs the Next.js app instead of the Nuxt app, on the same port (`:3000`) with the same environment variables and volume mounts (notably the SQLite DB path).
- For the production Docker image, use a multi-stage Dockerfile that compiles `better-sqlite3` natively against the runtime image's platform (Node base image, matching glibc/musl). Do not rely on Next.js's `standalone` output mode for the SQLite path unless it is verified to include the native binding correctly — the safe default is to ship the full production `node_modules` in the runtime stage. The plan step is responsible for picking and validating the exact strategy; the requirement is simply that the deployed container can open the SQLite DB without runtime errors and without manual rebuild steps after `./docker/warren start`.
- Update the `warren` CLI so `./docker/warren setup`, `start`, `start --dev`, `stop`, and `restart <svc>` continue to work end-to-end against the new app. `start --dev` runs `next dev` (or equivalent) instead of `nuxt dev`.
- Update Docker integration tests under `docker/tests/` so they pass against the new UI service.
- Keep the new app at `nextjs-ui/` — extend the existing starter in place. Do not rename or relocate the directory, and do not create a parallel third UI tree.
- Once the new app reaches parity (all acceptance criteria green), remove the old Nuxt code at `ui/` in the same change that flips docker-compose and the `warren` CLI to point at `nextjs-ui/`. After that change, there is exactly one UI directory in the repo (`nextjs-ui/`) and it contains the Next.js app.

### Testing

- Add an end-to-end test harness to `nextjs-ui/` using **Playwright** — the standard E2E choice for Next.js, officially recommended in the Next.js docs and the default in `create-next-app`'s testing examples. Tests run locally via an `npm run test:e2e` script. Local development may run the suite against `next dev` for fast feedback; the canonical integration run (and the run wired into `docker/tests/`) executes against the production build inside the Docker stack so it exercises the same artifact that ships.
- E2E coverage must include, at minimum: login flow, room dashboard load, toggling a light via a per-tile control, toggling the global master switch, opening the light group dialog and switching its theme, and the Hue setup flow up to the pairing call.
- Add an API-level test for the device-facing contract: a sensor announce + config fetch + reading post round-trip executed without a session cookie, verifying the auth allowlist still permits these endpoints and that posted readings are persisted.
- Wire the E2E suite into the Docker integration tests under `docker/tests/` (or a sibling script) so a single command verifies the whole stack end-to-end before cutover.

### Documentation

- Rewrite `ui/CLAUDE.md` to describe the Next.js project structure (app router, route handlers, server-side subsystem boot, shared dir).
- Update the root `CLAUDE.md`: remove the "exploratory `nextjs-ui/` sandbox" note, update the architecture diagram and bullet list to call `ui/` a Next.js app, and revise any conventions that referenced Nuxt-specific concepts (e.g. `nuxt.config.ts`, the `themeBootstrapScript` location).
- Update `docker/CLAUDE.md` if any service notes reference Nuxt build or dev specifics.

## UI / UX

The user-facing experience does not change. Every page, control, and flow that exists in the current Nuxt dashboard must be present in the Next.js app at cutover, styled with Tailwind Plus + Catalyst components. The visual language stays in the same family — semantic color tokens (`bg-surface`, `bg-surface-2`, `text-text`, `text-subtle`, `ring-default`, `bg-accent-soft`, `text-accent-strong`, etc.), six color schemes, dark by default — only the component implementation moves from Vue + Headless UI Vue to React + Catalyst (which itself uses Headless UI React under the hood).

Touch-vs-mouse hover behavior must be preserved: controls that auto-hide on hover use Tailwind v4's `pointer-fine:` variant, not plain `group-hover`, so touch devices keep controls visible.

The PWA install affordances added under `ui/` (Android beforeinstallprompt menu item, iOS install hint, manifest, service worker, icons) must continue to work in the Next.js app.

## Data Model

No schema changes. The migration reuses the existing SQLite database file and InfluxDB `warren` bucket as-is. The list of tables — `sensors`, `rooms`, `sensor_config`, `sensor_announcements`, `blocked_sensors`, `hue_bridge`, `hue_devices`, `hue_light_state`, `light_groups`, `light_group_members`, plus auth/session tables — is unchanged. Column additions or non-trivial migrations remain out of scope; if any are discovered to be necessary during implementation they are flagged in a separate spec.

## API

No new endpoints. Every endpoint listed below must exist on the new app with matching method, path, request shape, response shape, and auth requirements (i.e. continues to be in `PUBLIC_EXACT`/`PUBLIC_PREFIXES`/`PUBLIC_PATTERNS` if it is today, or session-protected otherwise):

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/_auth/session`
- `POST /api/sensors/announce`
- `GET /api/sensors/config/{id}` (and any other paths under that prefix used by ESP32s)
- `POST /api/sensors/{id}/reading`
- `GET /api/sensors/discovered`, plus the room/sensor/light-group CRUD currently under `/api/sensors/**`, `/api/rooms/**`, `/api/light-groups/**`
- `POST /api/lights/master-state` (and any sibling routes under `/api/lights/**`)
- `POST /api/integrations/hue` (pair), the sync endpoint, and `POST /api/integrations/hue/lights/{deviceId}/state` accepting `{ on, brightness, color, theme }`

The complete endpoint inventory is whatever is reachable in `ui/server/api/**` at the moment the plan starts; the plan step is responsible for enumerating it precisely and tracking each one to a Next.js route handler.

## Acceptance Criteria

- [ ] `./docker/warren start` boots the Next.js app on port 3000 and the dashboard loads.
- [ ] `./docker/warren start --dev` runs `next dev` (or equivalent) with hot reload working end-to-end.
- [ ] `./docker/warren setup`, `stop`, and `restart <svc>` all work against the new UI service.
- [ ] Every page in the existing Nuxt dashboard exists in the Next.js app and is reachable with the same navigation flows.
- [ ] Every API route in the existing Nuxt server has a Next.js equivalent at the same path with the same auth rule, request shape, and response shape; ESP32 firmware and the camera continue to work without re-flashing.
- [ ] An ESP32 sensor flashed against the previous Nuxt app posts readings successfully against the new app, with no firmware change.
- [ ] The MQTT subscriber boots on server start and processes camera announces.
- [ ] The Hue runtime boots on server start, polls every 10 seconds, upserts `hue_devices` + `hue_light_state`, and writes Hue motion/light-level readings to the `sensor_readings` InfluxDB measurement.
- [ ] The existing SQLite database from the Nuxt app is opened by the Next.js app without a manual migration step; existing rooms, sensors, light groups, and Hue config are visible in the new dashboard.
- [ ] Color schemes and light/dark mode persist across the cutover via the same `localStorage` keys, with no flash on first paint.
- [ ] PWA install (Android prompt + iOS hint) works against the Next.js app and the manifest/service worker are served.
- [ ] Docker integration tests under `docker/tests/` pass against the new UI service.
- [ ] The new app lives at `nextjs-ui/` (the existing starter, extended in place) and the old `ui/` Nuxt directory has been removed; there is exactly one UI directory in the repo.
- [ ] An E2E test harness exists in `nextjs-ui/` and `npm run test:e2e` (or the chosen equivalent) passes locally and in the Docker integration test flow.
- [ ] E2E suite covers: login, room dashboard load, per-tile light toggle, global master switch, light group dialog + theme switch, and Hue setup pairing flow.
- [ ] An API-level test verifies the device-facing round-trip (sensor announce → config fetch → reading post) succeeds without a session cookie and that the reading is persisted to InfluxDB.
- [ ] Root `CLAUDE.md`, `nextjs-ui/CLAUDE.md` (replacing the placeholder), and (if needed) `docker/CLAUDE.md` are updated to reflect the new stack; the "exploratory sandbox" note about `nextjs-ui/` in the root `CLAUDE.md` is removed and replaced with documentation of the canonical Next.js app.

## Open Questions

_None outstanding — all prior open questions have been resolved (directory: keep `nextjs-ui/`; auth compat: not required, pre-release; SQLite/Docker: multi-stage native compile, ship full prod node_modules; Nuxt-specifics: assumed none, surface if found; E2E: Playwright, prod build under Docker)._

## Notes / Assumptions

- The current dashboard is assumed not to depend on Nuxt-specific runtime behavior (auto-imports, route middleware ordering, server plugin boot order, etc.) in ways that meaningfully shape user-visible features. Auto-imports become explicit imports; server plugin boot becomes a boot hook in the Next.js server (e.g. an instrumentation file or an explicit init module). If the implementer encounters a Nuxt behavior that does not have a clean Next.js equivalent, surface it before working around it — do not silently change behavior to fit the framework.
