# nextjs-ui/CLAUDE.md

The Next.js 16 dashboard + REST API for Warren. App Router, Tailwind v4, Tailwind Plus's Catalyst components.

> **Next.js 16 specifics — read first.** This is **not** the Next.js you may have seen in training data. Read `node_modules/next/dist/docs/01-app/` for the current API. Notable renames:
> - `middleware.ts` → `proxy.ts` (Node.js runtime by default in 16)
> - Route-handler `ctx.params` is now a **Promise** — must `await`
> - `RouteContext<'/path/[id]'>` is a global generated type (run `next typegen` or build to refresh)

## Commands

```bash
npm run dev          # Next.js dev server at localhost:3000
npm run build        # Production build
npm run start        # Run the production build (next start)
npm run test:e2e     # Playwright E2E suite (boots `next dev` automatically)
```

## Project layout

```
app/
├── layout.tsx              Root layout: theme bootstrap script, manifest, SW registration
├── globals.css             Tailwind v4 + Warren color tokens (six schemes × dark/light)
├── (auth)/                 Route group — bare-shell auth pages (no sidebar)
│   └── login/page.tsx
├── (dashboard)/            Route group — sidebar shell wraps everything
│   ├── layout.tsx          Mounts <SidebarShell>
│   ├── page.tsx            Room dashboard
│   ├── sensors/page.tsx
│   ├── lights/page.tsx
│   └── integrations/hue/page.tsx
├── api/                    Route handlers (38 endpoints)
└── components/
    └── warren/             Domain components (RoomCard, SidebarShell, theme controls)

lib/
├── shared/                 Cross-tier code (types, light themes); imported by client AND server
├── server/                 Server-only code (DB, InfluxDB, MQTT, Hue, sessions, light groups)
└── hooks/                  Client React hooks (useSession, useRooms, useTheme, ...)

instrumentation.ts          Server boot hook — runs once, gated on NEXT_RUNTIME=nodejs
proxy.ts                    Auth allowlist for /api/* + redirect to /login for browsers
next.config.ts              `serverExternalPackages` for native modules + PWA cache headers
playwright.config.ts        E2E test config (auto-starts `next dev` unless WARREN_BASE_URL is set)
tests/e2e/                  Playwright specs
public/                     manifest.webmanifest, sw.js, icons, favicon
```

## Conventions

### Auth

Sessions are sealed cookies via `iron-session` (no DB session table). The `proxy.ts` allowlist mirrors what the legacy Nuxt middleware enforced; new device-facing endpoints must be added there. Server code accesses the session via `getSession()`/`setSession()`/`clearSession()` from `lib/server/session.ts`.

### Route handlers

Use the standard pattern from `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`:

```ts
export async function GET(req: NextRequest, ctx: RouteContext<'/api/foo/[id]'>) {
  const { id } = await ctx.params       // Note: params is a Promise in Next 16
  return Response.json({ id })
}
```

Errors thrown from helper functions can be turned into JSON 4xx/5xx responses via `lib/server/errors.ts:httpErrorResponse(err)`. Most route handlers return responses inline rather than throw.

### Background subsystems

`instrumentation.ts` calls `bootServer()` (in `lib/server/boot.ts`) which:
1. `initDb()` — sets up SQLite schema and migrations
2. `startMqtt()` — opens the MQTT subscriber
3. `hueRuntime.start()` — kicks off the 10-second Hue poller

All three are guarded by `globalThis` flags so dev HMR doesn't leak. Process SIGTERM/SIGINT shut them down cleanly.

### Data layer

- SQLite path resolves to `${WARREN_DATA_DIR}/warren.db`, defaulting to `<cwd>/.data/warren.db`. The Docker image sets `WARREN_DATA_DIR=/data`.
- The `better-sqlite3` and `mqtt` packages are listed in `next.config.ts:serverExternalPackages` so they aren't bundled by webpack.
- InfluxDB queries use `queryInflux(sql)` from `lib/server/influxdb.ts`; it returns `[]` for missing measurements rather than throwing.

### Styling

- CSS-first Tailwind v4 (no `tailwind.config.js`). Tokens defined in `app/globals.css` with `@theme`.
- Use semantic tokens (`bg-surface`, `text-text`, `ring-default`, `text-accent-strong`, etc.) — they remap per `data-scheme` attribute, which is how the six color schemes swap.
- Pre-paint theme/scheme bootstrap is an inline `<script>` in `app/layout.tsx` reading `localStorage warren:theme` + `warren:scheme`.
- Touch-vs-mouse hover: use `pointer-fine:opacity-0 pointer-fine:group-hover/tile:opacity-100`, not plain `group-hover`. Plain `group-hover` keeps controls invisible on touch devices.

### Required env vars

| Var | Purpose |
|---|---|
| `WARREN_AUTH_USERNAME`, `WARREN_AUTH_PASSWORD` | Default login credentials when no `users` row exists |
| `WARREN_SESSION_PASSWORD` | iron-session sealing password (≥32 chars) |
| `WARREN_DATA_DIR` | Path for `warren.db` (default: `<cwd>/.data`) |
| `INFLUXDB_URL`, `INFLUXDB_TOKEN`, `INFLUXDB_DATABASE` | InfluxDB 3 connection |
| `MQTT_URL`, `MQTT_USER`, `MQTT_PASS` | Mosquitto connection |
| `HUE_FAKE` | When `1`, the Hue client serves stub bridge data (used by E2E tests) |

`./docker/warren setup` writes these to `nextjs-ui/.env`. The dev server picks them up via Next.js's built-in `.env` loading; the production server (started by `./docker/warren start`) sources `.env` explicitly.

### Docker deployment notes

The multi-stage `Dockerfile` runs as a non-root `warren` user (uid 1001). When mounting a host path at `/data`, the host directory must be writable by uid 1001 — either pre-chown it (`chown -R 1001:1001 /path/to/data`) or use a Docker named volume (`docker volume create warren-data`), which is uid-agnostic. The default `./docker/warren start` flow runs the UI as a host process (not in Docker), so it doesn't hit this — but the Dockerfile is what E2E tests and any future containerized deployment use.

Verified end-to-end with a smoke test: build the image, boot it with the env vars above, and it serves `/api/sensors/announce`, `/api/sensors/config/{id}`, `/api/auth/login`, and the proxy auth check correctly. `better-sqlite3`'s native binding survives the multi-stage copy.
