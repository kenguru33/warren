# Feature Spec: Weather Component Using Yr

## Overview

Warren shows what the house is doing: temperature and humidity per room, motion, lights, cameras, music. It shows nothing about the world the house sits in. A room reading 19 °C means something different when it is 25 °C and sunny outside than when it is −8 °C and snowing, and right now the dashboard gives no way to tell those apart.

This feature adds outdoor weather from **Yr** — the forecast service run by the Norwegian Meteorological Institute (MET Norway) and NRK — via MET's free `api.met.no` Locationforecast product. It needs no account and no API key, which makes it a rare fit for Warren's posture: the Cast stack is anonymous by design and the Sonos stack is LAN-local specifically to avoid holding credentials, and this adds no credential either.

It does come with obligations rather than a key. MET's terms require every request to carry an identifying User-Agent naming the application and a contact point, require clients to honour the `Expires` header rather than poll freely, and require visible attribution to MET Norway. These are conditions of use, not implementation details, and a client that ignores them gets blocked.

Weather belongs to the house, not to a room — the same shape as the music player. It is one thing for the whole installation, and it fits the "House-wide" section of the dashboard's Add menu.

## Goals

- Show current outdoor conditions — temperature, a weather symbol, wind and precipitation — at a glance on the dashboard.
- Show a short forecast so the user can see what the rest of the day and the next few days look like.
- Give indoor sensor readings context, so a room temperature can be read against what it is doing outside.
- Let the household set the location it wants weather for, once.
- Meet MET's terms of service in full: identifying User-Agent, cache-respecting request cadence, conditional requests, and visible attribution.
- Add no account, no API key, and no credential at rest.

## Non-Goals

- Weather for more than one location. Warren is one house.
- Per-room weather. Weather is house-wide, like the music player.
- Weather history, or writing forecast data into InfluxDB. That pipeline is for sensor readings; a forecast is not a reading.
- Radar imagery, lightning, air quality, tides, or the other MET products. Locationforecast only.
- Automation on forecast values — no "close the blinds when sunny", no heater logic driven by outdoor temperature. Relay control stays on the sensor rules that already exist.
- Severe-weather alerts. MET publishes them separately and they carry their own presentation obligations.
- Replacing or altering any existing tile.

## User Stories

- As a user, I want to see the outdoor temperature next to my rooms, so that an indoor reading means something.
- As a user, I want to see whether it is going to rain today, so that I know before going out.
- As a user, I want a few days ahead at a glance, so that the dashboard answers the question I would otherwise open another app for.
- As a user setting Warren up, I want to give it my location once, so that weather is right for where I live.
- As a user, I want to know when the forecast was last updated, so that I can tell fresh data from stale.
- As a user on a wall panel, I want the weather readable across the room, so that it is useful without walking up to it.

## Functional Requirements

### Location

Three ways to choose, offered in the order they are actually wanted:

- **This device's position**, the default. Browser geolocation, one tap. Every failure mode — permission denied, position unavailable, timeout, unsupported — is named specifically, because "location unavailable" tells the user nothing about whether to grant permission or type a name instead.
- **A place by name.** Search resolves a town or city to coordinates, showing region and country so the many places sharing a name are distinguishable. The search is debounced and proxied through the server, never called from the browser.
- **Coordinates**, behind a disclosure. Kept because the other two both depend on something that can fail, and a setup screen that can dead-end is worse than one with a plain fallback.

- Whichever route is used, the result is one latitude/longitude pair with an optional label, validated to be in range.
- Coordinates are truncated to at most four decimals before being sent. MET requires this, and unrounded coordinates defeat their caching and are treated as abuse.
- Weather is absent from the dashboard until a location is set. The component is invisible rather than present and empty, matching how the music player behaves before it is configured.
- Changing the location refreshes the forecast rather than waiting for the next scheduled fetch.

### Fetching the forecast

- The forecast comes from MET's Locationforecast product, the `compact` variant, which carries everything this feature shows.
- **Every request carries an identifying User-Agent** naming Warren and a contact point. MET blocks generic or missing identification, and this is a condition of use rather than a nicety.
- **The `Expires` header is honoured.** MET publishes when a forecast will next change; requesting sooner is pointless and against the terms. The refresh cadence follows that header rather than a fixed interval.
- **Conditional requests are used.** The `Last-Modified` value from the previous response is sent back as `If-Modified-Since`, and a `304` is treated as success with the cached forecast retained.
- Fetching happens on the server, once per installation, not per browser. Several dashboard clients must not each become a separate consumer of MET's API.
- The forecast is cached server-side so a client render never triggers an upstream request.
- A failed fetch retains the last good forecast and records why, rather than discarding what is already known.
- Requests are made only when a location is configured.

### What is shown

- Current conditions: temperature, weather symbol, wind speed and direction, and precipitation for the coming hour.
- A short-term view of the next several hours.
- A multi-day view of the coming days, each with a symbol and a high/low.
- The time the forecast was last successfully updated.
- Attribution to MET Norway, visible in the component rather than buried in a settings page, with a link to the licence.

### Staleness and failure

- A forecast older than a defined threshold is marked stale rather than shown as though it were current.
- A forecast that cannot be fetched at all — no location, no network, upstream failure — says so plainly and distinguishes those cases from each other.
- The component never shows an empty temperature or a blank symbol as if it were data.

### Terms compliance

- Attribution to MET Norway is visible wherever forecast data is shown.
- Weather icons come from MET's own published icon set, used under its licence, with that licence recorded alongside the project's other third-party notices.
- The User-Agent identifies the application and a contact point.
- No request is issued before the previous response's `Expires` time, except when the user explicitly asks to refresh or changes the location.

## UI / UX

Weather is a dashboard card alongside the room grid and the music player, not inside a room card — it is house-wide, and the layout should say so.

The card leads with the current temperature and weather symbol at a size readable from across a room, since the wall panel is a primary surface. Wind and precipitation sit beneath as supporting detail. Below that, the hours ahead and then the days ahead, each compact enough that the card does not dominate the dashboard.

Attribution to MET Norway sits in the card, small but present and legible. The last-updated time sits with it; when the forecast is stale, that indication is unmistakable rather than a subtle colour change.

Setting up weather is reached from the dashboard's existing **Add** menu, under **House-wide**, next to Music — this is exactly the kind of thing that menu's second section exists for. Location is entered in a dialog, following the patterns the other configuration dialogs already use.

The card is theme-aware and works in both light and dark and across the six colour schemes, using the semantic tokens rather than fixed colours. Weather symbols must remain legible on both backgrounds.

## Data Model

A single-row configuration holds the location: latitude, longitude, an optional label the user recognises, and when it was set.

The cached forecast is stored server-side with the `Expires` and `Last-Modified` values from the response, since both are needed to honour the caching contract, plus the time of the last successful fetch and the last error if there was one. Caching the raw response rather than a derived summary means the presentation can change without a schema change.

Nothing about weather is a sensor. It produces no readings, must not appear in sensor discovery, and must not be written to InfluxDB — the same boundary the music player observes.

Adding a table means the backup snapshot schema version must be bumped, per the note in the database module.

## API

- An endpoint to read and set the weather location, and to clear it.
- An endpoint returning the current forecast view for the dashboard, served from the server-side cache.
- An endpoint to force a refresh, for use after a location change or an explicit user request.
- No new device-facing endpoints, so no change to the auth allowlist in the proxy.

## Acceptance Criteria

- [ ] With no location set, no weather UI appears anywhere on the dashboard.
- [ ] Setting a location is reachable from the Add menu under House-wide, and the forecast appears without a manual reload.
- [ ] Coordinates are truncated to four decimals before being sent upstream.
- [ ] Every upstream request carries an identifying User-Agent naming the application and a contact point.
- [ ] No upstream request is made before the previous response's `Expires` time, except on explicit refresh or a location change.
- [ ] `If-Modified-Since` is sent, and a `304` retains the cached forecast and counts as success.
- [ ] Several dashboard clients open at once produce no more upstream traffic than one.
- [ ] The card shows current temperature, symbol, wind and precipitation, plus an hourly and a multi-day view.
- [ ] Attribution to MET Norway is visible in the card, with a link to the licence.
- [ ] A stale forecast is marked as stale; a failed fetch retains the last good forecast and says what went wrong.
- [ ] No location, no network, and an upstream error are distinguishable from each other.
- [ ] Nothing weather-related appears in sensor discovery or InfluxDB.
- [ ] The card is legible in light and dark and across all six colour schemes.
- [ ] The weather paths are exercisable in tests without reaching MET's API.
- [ ] Existing suites pass untouched.

## Resolved Decisions

1. **MET's Locationforecast, `compact` variant.** Verified directly: it needs no key, answers `200`, and returns everything this feature shows — `air_temperature`, `wind_speed`, `wind_from_direction`, `relative_humidity`, `cloud_area_fraction`, plus `symbol_code` and `precipitation_amount` for the next hour and next six hours. The response carries roughly ten days across about ninety entries, hourly at first and coarser further out, which is more than enough for an hourly and a multi-day view. The `complete` variant adds fields this feature does not use.

2. **The terms are a design input, not paperwork.** MET requires an identifying User-Agent and blocks generic or missing ones; requires clients to honour `Expires` rather than poll; and requires attribution. That shapes three concrete decisions: fetching happens once on the server rather than per browser, the refresh cadence is driven by the response rather than a constant, and attribution is in the component rather than hidden in settings. A dashboard left open on a wall panel is exactly the client that would otherwise generate abusive traffic.

3. **Current position first, then place-name search, then coordinates.** The original decision here was coordinates only, on the grounds that MET does not geocode and adding a geocoder means another service and another failure mode. That reasoning was sound about the cost and wrong about the benefit: asking a household to look up their latitude is a poor first impression for a dashboard, and both better routes degrade cleanly to the fallback rather than replacing it.

   Geolocation costs nothing — it is in the browser — so it leads. For search, **Open-Meteo's geocoding API** is the narrowest addition available: purpose-built for name-to-coordinate lookup, no account or key, and it returns region and population, which is what makes "Oslo, Norway" distinguishable from "Oslo, Minnesota" in a picker. Nominatim was the alternative and is stricter — one request per second, no bulk use — for less structured data. The geocoder is used *only* to turn a name into coordinates; every byte of forecast data still comes from MET.

   Search is proxied through Warren rather than called from the browser, so the outgoing request carries Warren's identification and a wall panel left on a setup screen cannot become a direct consumer of someone else's API.

4. **Weather is house-wide, and belongs in the Add menu's House-wide section.** It is one thing for the installation, like the music player, and that section exists precisely for things not tied to a room.

5. **MET's own icon set**, published under the MIT licence, rather than a third-party pack. It is the set the symbol codes are designed for, so the mapping is exact rather than approximate.

6. **The raw response is cached, not a derived summary.** Presentation will change; the caching contract with MET should not have to change with it, and `Expires` and `Last-Modified` must be stored regardless.

7. **A fake mirrors the existing `WARREN_*_FAKE` stubs.** The Cast and Sonos work both established that without one the paths are untestable in CI, and the Sonos work established the sharper lesson that a fake unable to represent the real states produces a green suite over a broken feature. This one must model a fresh forecast, a stale forecast, a `304`, and an upstream failure — not only the happy path. Tests must never reach MET's API.

## Open Questions

- What is the household's location? The spec cannot fill this in, and a wrong default is worse than an empty one.
- What contact point goes in the User-Agent? MET expects a real one — a project URL or an email — and it should be a deliberate choice rather than something invented.
- How many days should the multi-day view show? The response supports roughly ten, but a wall panel card that tries to show ten becomes unreadable.
- Should the card show sunrise and sunset? It is a natural companion but comes from a different MET product with its own request, which would double the upstream traffic for something that changes once a day.
- Should indoor and outdoor temperature be shown together anywhere — the comparison is the stated reason for the feature, but putting outdoor temperature inside every room card would clutter them.
- Is there value in a compact variant of the card for the wall panel, or is one responsive card enough?
