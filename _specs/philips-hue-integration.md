# Feature Spec: Philips Hue Integration

## Overview

Add support for connecting Warren to a Philips Hue Bridge so that Hue lights and Hue sensors (motion, temperature, light level) become first-class devices alongside the existing ESP32 sensors and cameras. Users will be able to discover and pair a Hue Bridge from the Warren UI, browse the lights and sensors it exposes, and assign them to rooms in the same way custom sensors are assigned today. This brings off-the-shelf Hue hardware into the Warren ecosystem without requiring users to build or flash a sensor themselves.

## Goals

- Discover and pair a Philips Hue Bridge on the local network from the Warren UI.
- Persist the Hue Bridge connection (IP and application key) so Warren reconnects automatically after restarts.
- Import Hue lights as controllable devices that can be assigned to rooms and toggled on/off, with brightness control where supported.
- Import Hue sensors (motion, temperature, ambient light level, daylight) and surface their readings in the same way ESP32 sensors are surfaced.
- Provide a clear, guided UI flow for the link-button pairing handshake that Hue requires.
- Allow the user to disconnect/forget the Hue Bridge and remove all associated devices.

## Non-Goals

- Supporting multiple Hue Bridges simultaneously (only one bridge per Warren installation in this iteration).
- Cloud-based Hue access via Philips' remote API; only local LAN connections are supported.
- Hue Entertainment / sync features (gradient strips, sync box, music sync).
- Creating, editing or deleting Hue scenes, rooms or routines on the bridge itself — Warren reads bridge state, it does not manage Hue's own grouping.
- Replacing Hue's own app for advanced configuration (firmware updates, ZigBee channel changes, etc.).
- Automation rules that bridge Hue sensors to Hue lights inside Warren (out of scope for this spec; may be a later feature).

## User Stories

- As a Warren user, I want to connect my Philips Hue Bridge to Warren, so that my existing Hue lights and sensors show up alongside my custom sensors.
- As a Warren user, I want a guided pairing flow that tells me when to press the link button on my bridge, so that I don't have to read external documentation.
- As a Warren user, I want to assign Hue lights and Hue sensors to specific rooms, so that they appear on the relevant room's dashboard.
- As a Warren user, I want to toggle a Hue light on/off and adjust its brightness from a room dashboard, so that I can use Warren as a single control surface.
- As a Warren user, I want to see Hue motion and temperature readings in Warren's history graphs, so that I can compare them to my ESP32 sensor data.
- As a Warren user, I want to disconnect the Hue Bridge, so that I can remove the integration cleanly when I no longer want it.
- As a Warren user, I want Warren to reconnect to the Hue Bridge automatically after I restart the stack, so that I don't have to re-pair every time.

## Functional Requirements

### Bridge Discovery and Pairing

- The UI provides a "Connect Hue Bridge" entry point in the integrations / settings area.
- Warren attempts to discover Hue Bridges on the local network using Philips' discovery service (`https://discovery.meethue.com`) and/or mDNS as a fallback.
- The user can also enter a Hue Bridge IP address manually if discovery fails.
- During pairing, Warren prompts the user to press the physical link button on the bridge, then polls the bridge for an application key for up to 30 seconds.
- On successful pairing, the bridge IP and application key are persisted; the UI confirms success and shows the bridge name and model.
- Failed pairing (timeout, link button not pressed, network error) shows a clear error message with a retry option.
- Only one Hue Bridge may be connected at a time; attempting to pair a second bridge requires disconnecting the first.

### Device Import and Sync

- After pairing, Warren fetches the list of lights and sensors exposed by the bridge and stores a local representation of each.
- Each Hue light and sensor is treated as a Warren device with a stable identifier derived from the bridge's unique ID combined with the Hue resource ID.
- Warren periodically polls the bridge for state changes (light on/off, brightness, sensor readings) at a configurable but sensible default interval.
- Sensor readings from Hue (temperature, motion, light level) are written into the same time-series storage used for ESP32 sensors so that history queries work uniformly.
- Lights are not written to the time-series store; their current state is held in memory / refreshed on demand.
- New Hue devices added to the bridge after the initial pairing appear in Warren on the next sync cycle without requiring re-pairing.
- Devices removed from the bridge are flagged as unavailable in Warren but their historical sensor data is retained.

### Room Assignment

- Hue lights and Hue sensors appear in the existing "discovered devices" list alongside ESP32 sensors so that they can be assigned to a Warren room.
- A Hue device that has been assigned to a room behaves like any other room device: it appears on the room dashboard and can be unassigned back to the discovered pool.
- Blocking a Hue device hides it from the discovered list using the same mechanism as `blocked_sensors`.

### Light Control

- Each assigned Hue light on a room dashboard exposes an on/off toggle.
- Lights that report a brightness capability expose a brightness slider (0–100%).
- Light commands are sent to the bridge over its local HTTP API; UI state updates optimistically and reconciles with the next poll.
- If a light command fails (bridge offline, timeout), the UI surfaces the error and reverts the optimistic state.

### Disconnection

- The user can disconnect the Hue Bridge from the integrations UI.
- Disconnecting removes the stored bridge credentials, removes Hue light entities, and detaches Hue sensors from rooms.
- Historical sensor data from Hue sensors is retained in the time-series store after disconnection.
- The user is warned about what will and will not be deleted before confirming.

### Reliability and Status

- The current connection status of the Hue Bridge (connected, unreachable, unauthorized) is visible in the integrations UI.
- If the bridge becomes unreachable, Warren retries on a backoff schedule and surfaces an offline indicator.
- If the application key is rejected by the bridge (e.g. revoked from the Hue app), the user is prompted to re-pair.

## UI / UX

- New "Integrations" area in the Warren UI (or a dedicated "Hue" page if integrations is not yet a concept), reachable from settings.
- Hue integration card with three primary states:
  - **Not connected** — shows a "Connect Hue Bridge" button that opens the pairing flow.
  - **Pairing in progress** — shows the discovered bridge(s), instructs the user to press the link button, and displays a countdown / progress indicator.
  - **Connected** — shows bridge name, IP, model, last sync time, count of imported lights and sensors, a "Sync now" action, and a "Disconnect" action.
- Manual IP entry is offered as a secondary option inside the pairing flow when discovery returns no results.
- Errors during pairing or syncing are shown inline on the Hue page with a retry affordance.
- On room dashboards, Hue lights render as a card with on/off toggle and (where supported) brightness slider; Hue sensors render using the existing sensor card patterns so they look consistent with ESP32 sensors.
- The discovered-devices list distinguishes Hue devices from ESP32 sensors with a small badge or icon so the user knows where each device originates.

## Data Model

- A new persisted record for the connected Hue Bridge containing at minimum: bridge ID, bridge name, IP address, application key, model, last successful sync timestamp, connection status. Only one such record exists at a time.
- A new persisted table for Hue devices imported from the bridge, keyed by a stable Warren-side identifier and storing: bridge reference, Hue resource ID, type (light or sensor subtype), display name, capabilities (e.g. supports brightness), room assignment (nullable), blocked flag, last seen timestamp.
- Hue sensor readings are written to the same time-series storage as existing sensor readings, using the Warren-side device identifier so that existing history endpoints work without schema changes specific to Hue.
- The auth middleware allow-lists are not affected; all Hue endpoints are session-protected since they are user-facing and not device-facing.

## API

New session-protected endpoints under `/api/integrations/hue/`:

- `GET /api/integrations/hue/status` — current connection status, bridge metadata, counts of imported devices.
- `POST /api/integrations/hue/discover` — trigger a discovery sweep, return candidate bridges.
- `POST /api/integrations/hue/pair` — start pairing against a given bridge IP; the server polls the bridge for the application key while the link button is pressed.
- `POST /api/integrations/hue/sync` — force an immediate sync of lights and sensors from the bridge.
- `DELETE /api/integrations/hue` — disconnect and forget the bridge.
- `GET /api/integrations/hue/devices` — list Hue-imported devices with their type, room assignment and capabilities.
- `POST /api/integrations/hue/lights/{id}/state` — set on/off and brightness for a Hue light; routes through the bridge.

Existing room and discovered-device endpoints are extended (without breaking changes) so that Hue devices appear and can be assigned, unassigned and blocked using the same flows as ESP32 sensors.

## Acceptance Criteria

- [ ] From a clean install with a Hue Bridge on the LAN, the user can navigate to the integrations page, run discovery, pair via the link button, and see the bridge marked as connected.
- [ ] After pairing, all Hue lights and supported Hue sensors appear in the discovered-devices list within one sync cycle.
- [ ] A Hue light can be assigned to a room and toggled on/off from the room dashboard, with the physical light responding.
- [ ] A Hue light that supports brightness can be dimmed via a slider, with the change reflected on the physical light.
- [ ] A Hue temperature sensor assigned to a room produces readings that appear in the room's history graph using the same UI as ESP32 sensors.
- [ ] Restarting the Warren stack reconnects to the bridge automatically without re-pairing.
- [ ] Disconnecting the bridge removes the bridge record and Hue light entities, while preserving historical sensor data.
- [ ] If the bridge becomes unreachable, the integrations page shows an offline status and Warren retries automatically.
- [ ] Manual IP entry works when automatic discovery returns no results.
- [ ] Attempting to pair while the link button is not pressed fails with a clear, actionable error after the timeout.

## Open Questions

- Should the polling interval for Hue state be configurable per user, or fixed (and if fixed, what value balances responsiveness against bridge load)?
- Does Warren support the Hue v2 EventStream (server-sent events) for near-real-time updates, or do we stay on polling for simplicity in v1?
- Should Hue lights have any presence in the time-series store (e.g. on/off state history), or is current-state-only sufficient for v1?
- How should Hue groups / rooms defined inside the Hue app interact with Warren rooms — ignored entirely, imported as suggestions, or surfaced as read-only metadata on each device?
- Should we expose color and color-temperature control for capable Hue lights in this iteration, or limit v1 to on/off + brightness?
- What is the desired behavior when a Hue device is reassigned in the Hue app (e.g. moved to a different Hue room) — does Warren resync naming, or treat the Warren-side name as authoritative once assigned?
- Is there a need to support guest / read-only application keys, or is a single full-permission key on the bridge acceptable?
