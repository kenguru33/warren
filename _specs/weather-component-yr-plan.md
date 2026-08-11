# Implementation Plan: Weather Component Using Yr

Spec: [`weather-component-yr.md`](weather-component-yr.md)

The spec's obligations to MET — identifying User-Agent, honour `Expires`, conditional requests, visible attribution — are the parts most likely to be got wrong quietly, so they are load-bearing here rather than a compliance appendix.

## 1. Spec reality check vs. existing code

Patterns this follows rather than invents:

- **Singleton config + background runtime** — `lib/server/hue/runtime.ts` and `lib/server/sonos/runtime.ts`: `globalThis`-cached state, `start()`/`stop()` from `boot.ts`, timers cleared on shutdown so dev HMR does not leak.
- **Single-row table with `CHECK(id = 1)`** — `music_config`, `hue_bridge`.
- **`WARREN_*_FAKE`** — `WARREN_CAST_FAKE`, `WARREN_SONOS_FAKE`, wired in `playwright.config.ts`.
- **House-wide feature invisible until configured** — the music player: no `music_config` row means no card, and setup is reached from the dashboard's Add menu under **House-wide**.
- **Catalyst dialog** — `music-config-modal.tsx` for the location dialog.

Nothing here needs a new dependency: `fetch` is built in.

## 2. Decisions this plan makes beyond the spec

**Icons: a small inline SVG set, not a vendored copy of MET's.** The spec said to use MET's published set, and the argument for it — exact mapping to `symbol_code` — is real. Against it: it is roughly a hundred files vendored into the repo, and I cannot visually verify them here. A compact inline set keyed off the symbol-code *prefix* (`clearsky`, `fair`, `partlycloudy`, `cloudy`, `rain`, `sleet`, `snow`, `fog`, `thunder`) with `_day`/`_night` variants covers every code MET emits, stays theme-aware through `currentColor`, and can be swapped for MET's set later without touching anything else. Recorded as a deviation rather than done silently.

**User-Agent contact point: the project's GitHub URL.** MET accepts a link to a site carrying contact information. `https://github.com/kenguru33/warren` is real, stable and already public. It is overridable by env for anyone running a fork, since a fork sending someone else's contact point would be worse than useless.

**One table, not two.** Location and cached forecast are both single-row and always read together; splitting them would mean two lookups on every render for no benefit.

## 3. New files

### 3.1 `lib/server/weather/client.ts`

The MET boundary, and the only place the terms are enforced:

- `fetchForecast(lat, lon, lastModified)` → `WeatherResult<{ payload, expiresAt, lastModified } | 'not-modified'>`.
- Truncates coordinates to **4 decimals** before building the URL — MET requires it, and unrounded coordinates defeat their cache and are treated as abuse.
- Sends `User-Agent: Warren/<version> (+<contact>)` on every request.
- Sends `If-Modified-Since` when a previous `Last-Modified` exists; **`304` is a success**, not an error, and returns `'not-modified'`.
- Parses `Expires` into a timestamp; when absent, falls back to a conservative interval rather than to "fetch immediately".
- Typed failures, never throws — matching the Sonos and Cast stacks.
- `WARREN_WEATHER_FAKE` short-circuits to fixtures and **never touches the network**.

### 3.2 `lib/server/weather/runtime.ts`

- `start()` from `boot.ts`: schedules a check every few minutes that **fetches only when `expires_at` has passed**. The timer cadence and the request cadence are deliberately different things — a fixed request interval is what the terms forbid.
- `refreshNow()` for an explicit user refresh or a location change.
- Writes the raw payload, `expires_at`, `last_modified`, `fetched_at`, `last_error` to the single row.
- A failed fetch **keeps the last good payload** and records the error.
- `stop()` clears the timer.

### 3.3 `lib/server/weather/view.ts`

Derives the dashboard view from the cached raw payload — current conditions, hourly entries, daily aggregates with high/low — plus staleness. Kept separate from the client so presentation can change without touching the caching contract.

Daily high/low is computed from the timeseries by local calendar day; MET returns instants and 1/6-hour blocks, not days, so this is derived rather than read.

### 3.4 `app/api/weather/route.ts`

- `GET` — the view, from cache. `configured: false` is a normal response.
- `PUT` — set location; validates ranges; triggers a refresh so the card is populated immediately.
- `DELETE` — clear location and cache.

### 3.5 `app/api/weather/refresh/route.ts`

`POST` — explicit refresh, the one sanctioned way to bypass `Expires`.

### 3.6 `app/components/warren/weather-card.tsx` + `weather-icon.tsx`

Card: current conditions large enough for the wall panel, hourly strip, daily rows, attribution and last-updated. Icon: prefix-mapped inline SVG using `currentColor`.

### 3.7 `app/components/warren/weather-location-modal.tsx`

Catalyst dialog for latitude/longitude plus an optional label.

## 4. Edited files

- `lib/server/db.ts` — `weather_config` table; **bump `SNAPSHOT_SCHEMA_VERSION`** and add the table to `BACKUP_TABLES` in `lib/shared/backup.ts`, per the note in the database module.
- `lib/server/boot.ts` — start/stop the runtime.
- `lib/shared/types.ts` — `WeatherView`, `WeatherCurrent`, `WeatherHour`, `WeatherDay`.
- `lib/hooks/use-weather.ts` — SWR read plus set/clear/refresh.
- `app/(dashboard)/page.tsx` — render the card; add **Weather** to the Add menu's House-wide section.
- `playwright.config.ts` — `WARREN_WEATHER_FAKE: '1'`.

## 5. Fake states

Per the spec, and because the Sonos work shipped a broken feature through a green suite when its fake could not reach the real states, the fake must model:

- a fresh forecast,
- a **stale** forecast (fetched long ago),
- a `304 Not Modified`,
- an upstream failure with a previous good payload retained,
- unconfigured (no location).

## 6. Test plan

Extend with `tests/e2e/weather.spec.ts`:

- unconfigured returns `configured: false` and no forecast;
- setting a location returns a populated view;
- invalid coordinates are rejected with 400 (out of range, non-numeric, missing);
- coordinates are stored truncated to 4 decimals;
- the view carries current, hourly and daily sections and a last-updated time;
- a stale forecast is flagged stale rather than presented as current;
- clearing the location removes the forecast;
- no test reaches `api.met.no`.

UI tests are written but **will not run** — the Playwright browser download fails in this environment, which is why the existing suite reports 2 failures. That is stated, not counted as passing.

## 7. Sequencing

1. Types, table, migration; verify against a copy of the live database.
2. Client with the three obligations; verify against MET once, by hand, including a `304`.
3. Runtime + view derivation.
4. Routes; verify with `curl`.
5. Fake + API tests.
6. Card, icon, dialog, Add-menu entry.
7. `tsc`, lint, build, full E2E.
8. Deploy and verify on the real host.
9. Docs: root `CLAUDE.md` and `nextjs-ui/CLAUDE.md`.

## 8. Risks

- **Silently violating the terms** is the main one, and it fails invisibly until MET blocks the host. Mitigated by making cadence a function of `Expires`, fetching server-side once, and asserting the User-Agent in a test.
- **Several dashboards open** must not multiply upstream traffic — guaranteed by fetching in the runtime rather than per request.
- **Timezone handling** for daily grouping: MET returns UTC instants, and days must group by local time or the highs and lows land on the wrong day.
- **A wall panel showing ten days** would be unreadable; the daily view is capped.

## 9. Explicitly not changing

- Sensors, rooms, lights, music, Cast, Sonos.
- The InfluxDB pipeline — a forecast is not a reading and must not enter it.
- The proxy auth allowlist: no device-facing endpoint is added.

## Critical files

- `nextjs-ui/lib/server/weather/client.ts` — the only place MET's terms are enforced
- `nextjs-ui/lib/server/weather/runtime.ts` — cadence driven by `Expires`, not a constant
- `nextjs-ui/lib/server/db.ts` + `lib/shared/backup.ts` — table and snapshot version
- `nextjs-ui/app/(dashboard)/page.tsx` — card placement and the Add-menu entry
