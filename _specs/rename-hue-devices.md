# Feature Spec: Rename Hue Devices

## Overview

Today, names for Hue lights, sensors, and other Hue-imported devices are dictated by the Philips Hue app and refreshed on every poll cycle. Users have no way to give a Warren-friendly name without changing it inside the Hue app first. This feature lets users rename any Hue device — lights, motion sensors, temperature sensors, light-level sensors — directly inside Warren and have that name persist regardless of what the Hue Bridge reports later.

## Goals

- Let users assign a Warren-side display name to any Hue device, distinct from the bridge-reported name.
- Keep the Warren name authoritative once set: the background poller must not overwrite it on subsequent syncs.
- Make rename available wherever Hue devices appear: Lights page, Sensors page, room dashboard, Add Device dialog, integrations device list.
- Preserve the bridge name as a fallback so a user can revert to "what Hue calls it" if they want to.

## Non-Goals

- Renaming the device on the bridge itself (push the new name back to Hue). This stays one-way: Warren-only.
- Bulk rename or templated rename (e.g. "Lamp 1, Lamp 2"). Single-device rename only.
- Renaming Hue groups/rooms defined in the Hue app — those are still ignored by Warren.
- Renaming or relabeling ESP32 sensors via this feature; they already have a `label` field, and that flow stays unchanged.

## User Stories

- As a user, I want to rename a Hue light from "Hue color lamp 1" to "Reading lamp" without opening the Philips Hue app, so that Warren shows a name that makes sense to me.
- As a user, I want my custom name to stick across stack restarts and bridge syncs, so that I don't have to rename the device every time.
- As a user, I want to revert a Hue device back to its bridge-supplied name with a single action, so that I can recover from a bad rename.
- As a user, I want to see both the custom name (prominent) and the bridge name (secondary) when renaming, so that I know what the device was originally called.
- As a user managing many Hue devices, I want to rename a device from the same place I view it (room card, Lights page, Sensors page), so that I don't have to navigate elsewhere just to change a name.

## Functional Requirements

### Storage

- Each Hue device can carry a user-defined display name in addition to the bridge-supplied name.
- The user-defined name is preserved across sync cycles, stack restarts, and disconnect/re-pair flows where the device's stable identifier is unchanged.
- If a Hue device is removed from the bridge and later re-added with the same identifier, the user-defined name is reapplied.
- Disconnecting the bridge entirely (full removal) clears the user-defined name along with the device.

### Display name resolution

- Wherever a Hue device's name is shown, the resolution order is: user-defined name → bridge-supplied name → the device's stable identifier.
- The display logic is consistent across all surfaces: room dashboard tiles, Lights page rows, Sensors page rows, Add Device dialog, integrations device list.

### Rename action

- A rename action is available on every Hue device tile/row (room card, Lights page, Sensors page, integrations device list).
- The rename UI shows the current Warren name (if any) pre-filled, and the bridge-supplied name as a hint/placeholder.
- The user can submit an empty value to clear the Warren name and fall back to the bridge name (this is the "revert" affordance).
- Length is bounded so the UI doesn't break with absurdly long names.
- Saving updates the name immediately in the UI without a full page reload.

### Sync behavior

- The background poller continues to refresh the bridge-supplied name from the Hue Bridge on every cycle, but never overwrites the user-defined name.
- If the bridge name changes (e.g. the user renamed it in the Hue app afterwards), the new bridge name becomes the new fallback shown when the Warren name is cleared.

### Search and filtering

- Search and filter inputs across the Sensors and Lights pages match against the displayed (resolved) name, not just the bridge name.

## UI / UX

- A pencil/edit affordance appears on each Hue device tile and row, consistent with the existing edit affordance for ESP32 sensors. On the room card, it's surfaced when the room is in edit mode (matching today's pattern). On list pages, it's always visible on hover.
- Clicking the affordance opens an inline rename dialog (small modal or popover, matching the existing label-edit modal pattern in the Sensors page) with:
  - A single labeled text input pre-filled with the current Warren name.
  - The bridge-supplied name shown as helper text and as the input's placeholder.
  - Save / Cancel buttons. Save is disabled if nothing has changed.
  - A subtle "Use bridge name" affordance (link or secondary button) that clears the field.
- Confirmation/feedback: on save, the modal closes and the new name appears immediately on the underlying tile/row. On error (e.g. bridge briefly unreachable in cases where naming is also pushed — out of scope here but defensive), an inline error is shown.
- The Add Device dialog continues to show the bridge-supplied name in the discovered list (since at that point the device hasn't been imported into rooms yet, there is no Warren name to display); after assignment, all subsequent surfaces honor the user-defined name.

## Data Model

- The `hue_devices` table gains a column to store the user-defined display name. The bridge-supplied name remains in the existing `name` column and is kept up to date by the poller.
- The `sensors` table already has a `label` column. For Hue-backed `sensors` rows (where `device_id` starts with `hue-`), the existing label can serve as the rename for room-assigned devices, but the Hue-side name needs to be authoritative across both assigned and unassigned states. This spec resolves the duplication by storing the rename on `hue_devices` and treating any matching `sensors.label` as deprecated for Hue rows; alternatively the implementation can mirror the value on both for backwards compatibility — that decision belongs to the implementation plan.
- API responses that surface Hue devices include both a `name` (resolved/displayed) and a `bridgeName` (raw from the bridge) so the UI can render both.

## API

- A new endpoint to set or clear the Warren-side display name for a Hue device, addressed by its stable Warren device identifier. Submitting an empty/null name clears it and falls back to the bridge name.
- Existing endpoints that return Hue device data (`/api/integrations/hue/devices`, `/api/integrations/hue/status`, `/api/sensors`, `/api/sensors/discovered`, `/api/rooms`) are extended to expose both the resolved display name and the bridge-supplied name without breaking existing fields.

## Acceptance Criteria

- [ ] A user can rename a Hue light from the Lights page; the new name appears on the Lights page, on the room card, and on the Sensors page (where applicable) without a page reload.
- [ ] A user can rename a Hue temperature/motion/lightlevel sensor from the Sensors page or its room card; the new name persists.
- [ ] After a poll cycle, the user-defined name is not overwritten by the bridge-supplied name.
- [ ] After restarting the stack, user-defined names are still in effect.
- [ ] Submitting an empty name reverts to the bridge-supplied name and shows that name immediately.
- [ ] If the bridge-supplied name changes in the Hue app while a Warren name exists, the Warren name is still shown; clearing it then shows the new bridge name.
- [ ] Disconnecting and re-pairing the same bridge restores devices, and devices that were renamed before disconnect retain their Warren names if their identifier is unchanged.
- [ ] Search on the Sensors and Lights pages matches against the displayed name.
- [ ] Names beyond a sensible length (e.g. 60 characters) are rejected with a clear message.

## Open Questions

- Should the rename also propagate to the Hue Bridge (push back to Hue) so other Hue apps see the same name? Default in this spec: no. Open to revisit.
- For Hue sensors that are assigned to a room, should the rename surface continue to live on `sensors.label` (consistent with ESP32 sensors) or only on `hue_devices`? The implementation needs to choose one source of truth and migrate any existing labels accordingly.
- When a Hue device is removed from the bridge and reappears with the same identifier later, should the previously-saved Warren name be restored automatically, or kept dormant until the user re-confirms?
- Do we need an audit/log of name changes (when, by whom)? For a single-user home setup this is likely overkill, but worth confirming.
- Should there be a per-device "show bridge name as subtitle" option for users who want both visible at a glance, or is hover/edit-modal disclosure enough?
