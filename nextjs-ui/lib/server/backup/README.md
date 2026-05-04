# Warren snapshot file format

A snapshot is a JSON document that captures the editable configuration of a Warren install — rooms, sensors, sensor settings, light groups, theme assignments, the Hue bridge pairing, and user accounts. Time-series data (InfluxDB), camera frames, infrastructure secrets (MQTT, InfluxDB tokens, iron-session keys, TLS material), and ESP32 firmware NVS state are deliberately out of scope.

## Top-level shape

```
{
  "header": {
    "schema_version": <number>,
    "app_version":    "<package.json version at export time>",
    "host_id":        "<UUID stored in meta.host_id, or null>",
    "exported_at":    <ms epoch>,
    "row_counts":     { "<table>": <number>, ... }
  },
  "tables": {
    "<table>": [ { "<column>": <cell>, ... }, ... ],
    ...
  }
}
```

Cells are JSON `string | number | boolean | null`, with one exception: SQLite `BLOB` columns (rare in Warren) round-trip as `{ "$b64": "<base64-encoded bytes>" }`. The `isBinarySentinel()` helper in `lib/shared/backup.ts` identifies these on the parse side.

## `schema_version`

Lives in `lib/shared/backup.ts` as `SNAPSHOT_SCHEMA_VERSION`. Restore refuses any snapshot whose `schema_version` does not match the running host. Bump it whenever a backed-up table changes shape (column add/remove/rename, type change, CHECK constraint change) or a new table is added to `BACKUP_TABLES`.

## Table list and order

Defined in `lib/shared/backup.ts` as `BACKUP_TABLES`. The order is forward foreign-key dependency order: parents before children. The restore engine wipes in reverse order and inserts in this order; reordering the constant breaks FK enforcement during a restore.

| Table                  | Notes                                                                  |
|------------------------|------------------------------------------------------------------------|
| `rooms`                | Parent of most config.                                                 |
| `room_references`      | Per-room target temp/humidity. Not in the spec table list but included so a restore does not silently drop target climate data. |
| `sensors`              | FK → `rooms`.                                                          |
| `sensor_config`        | Per-device hysteresis offsets, poll/fetch intervals.                   |
| `sensor_announcements` | Camera + ESP32 boot announcements.                                     |
| `blocked_sensors`      | Block list keyed by `(device_id, type)`.                               |
| `hue_bridge`           | Single-row config (`id = 1`). Includes the `app_key` so restore can keep talking to the bridge. |
| `hue_devices`          | Lights and Hue motion / lightlevel sensors discovered from the bridge. |
| `hue_light_state`      | Last-known on/brightness/theme cache. Will be rehydrated by the runtime poller after restore. |
| `light_groups`         | Per-room light groupings + theme key.                                  |
| `light_group_members`  | FK → `light_groups`, FK → `sensors`.                                   |
| `users`                | Restore preserves the currently signed-in user's password (see below). |
| `meta`                 | Holds `host_id` and the `hue_schema_v1` migration flag. Round-tripped so a restored DB does not re-trigger the one-shot migration in `initDb()`. |

## What is intentionally not included

- InfluxDB `sensor_readings` (large, replayable from devices, separate retention story).
- Camera frame archives (cameras are stateless from the dashboard's point of view).
- `nextjs-ui/.env` — MQTT credentials, InfluxDB token, `iron-session` password are owned by `warren setup` and stay out.
- `docker/tls/` — Caddy CA + leaf cert.
- ESP32 firmware sources and on-device NVS config (reproducible from `firmware/` source).

## User-preservation rule on restore

The restore engine identifies the currently signed-in user via `getSession()` and protects their `password_hash` from the snapshot. Concretely: it captures the active user's row before wiping `users`, then when re-importing the snapshot's `users` table it substitutes the captured `password_hash` for any row whose `username` matches the active session. This prevents an operator from locking themselves out by restoring a snapshot taken with different credentials.

## Auto-increment sequence

After insert, the restore engine syncs `sqlite_sequence.seq` for each `AUTOINCREMENT` table to `MAX(id)` so subsequent inserts via the regular UI do not collide with restored IDs.

## Caveats

- **Orphan time-series.** Restoring a snapshot whose `sensors.id` collides with a different physical device than the one that produced existing InfluxDB rows will leave those time-series rows misattributed. Time-series export/import is out of scope.
- **Hue bridge re-pairing.** If the bridge has been factory-reset or the `app_key` revoked since the snapshot was taken, the post-restore re-sync will fail and the dashboard will show "Hue bridge needs re-pairing." The rest of the configuration is unaffected.
