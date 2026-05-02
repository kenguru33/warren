# Feature Spec: Confirm and Guard Light Room Assignment

## Overview

The lights list now lets users move any light to any room with a single click in the kebab menu. Two issues have surfaced:

1. **Grouped lights can be moved silently.** A light that is a member of a light group is room-scoped to its current room. The current implementation drops the membership row when the room changes, but this happens without warning the user, who may not realize the group will lose a member (or be deleted entirely if it was the last member).
2. **Room assignment is a one-click action.** Clicking a room in the kebab moves the light immediately. Because rooms appear together with the rest of the menu items, an accidental click on the wrong room reassigns the light without recourse.

This feature introduces two safeguards: a hard block for grouped lights (forcing the user to first remove the light from its group) and a confirmation dialog for every room move from the lights list.

## Goals

- Prevent surprising data loss from accidental room moves of grouped lights.
- Make room assignment feel deliberate by adding a confirmation step.
- Give the user a clear path forward when a move is blocked: either remove the light from its group, or cancel.

## Non-Goals

- Do not change the dashboard tile menus (those don't expose a "Move to room" action).
- Do not change the `POST /api/sensors` flow used by the room's "Add device" modal — that dialog already represents an explicit user choice and the source-room context is unambiguous.
- Do not change how groups are pruned when their last member is removed via the existing "Remove from group" path.
- Do not introduce a "move group" feature (groups stay in their room).

## User Stories

- As a user, when I try to move a grouped light to another room, I want to be told that it is in a group and be given a way to remove it from the group first, so that I do not accidentally break my group setup.
- As a user, when I pick a room from the kebab to move a light, I want to confirm the move before it happens, so that an accidental click does not silently reassign the light.
- As a user, when the light I am moving is the last member of a group, I want to know that the group will be deleted, so that I can decide whether to proceed.

## Functional Requirements

### Grouped-light guard

- The kebab "Move to room" items on the lights list must detect whether the light is currently a member of a light group.
- When a grouped light is selected, the user must not be able to complete the move directly. Instead, they must be shown a dialog explaining the situation that names the group and offers two paths:
  - **Remove from group** — performs the group-membership removal, then closes the dialog. The user can then re-open the kebab and pick a room.
  - **Cancel** — closes the dialog with no changes.
- The "Remove from room" item on the kebab must apply the same guard: a grouped light cannot be unassigned from its room without first being removed from its group.
- The guard must trigger before any network call that changes `room_id`. The user must never see a half-applied state.

### Confirmation dialog for room moves

- After the grouped-light guard passes (i.e. the light is not in a group), picking a room from the kebab must open a confirmation dialog before any `room_id` change is sent.
- The dialog must state:
  - the light's display name,
  - the source room name (or "Unassigned" if there is none),
  - the target room name.
- The dialog must offer **Move** and **Cancel**. Only **Move** triggers the network call.
- "Remove from room" must use a similar confirmation, with the target shown as "Unassigned".
- For unassigned (id-null) Hue lights being placed into a room for the first time, the same confirmation dialog applies. The source line reads "Unassigned" and the action label is **Add to room** instead of **Move**.

### Server consistency

- The PATCH `/api/sensors/[id]` endpoint already drops `light_group_members` when `room_id` changes. With the new client guard, this code path becomes a defense-in-depth fallback rather than the primary protection. The endpoint behavior must not change in this feature; the client owns the new UX.
- No new API endpoint is required to look up group membership: the lights list already receives `groupId` and `groupName` from `GET /api/sensors`.

## UI / UX

- **Grouped-light guard dialog.** Catalyst `Alert` (matching `confirm-dialog.tsx`) with the title "Light is in a group" and a body that names the group, e.g. "*Lightstrip Kontor* is part of the **Living room ambient** group. Remove it from the group before moving it to another room." Action buttons: **Remove from group** (primary) and **Cancel**.
- **Move confirmation dialog.** Same Alert pattern with the title "Move light?" and a body summarizing source and target rooms. Action buttons: **Move** (primary) and **Cancel**. For an "Unassigned" source the body wording adjusts naturally.
- **Remove-from-room confirmation dialog.** Same pattern with the title "Remove from room?" and **Remove** (destructive style) and **Cancel** actions.
- The kebab menu itself stays as it is today; the new dialogs sit on top.
- The room items in the kebab should not show a loading spinner — the action is handled by the dialog, so the menu can close immediately.

## Data Model

No schema changes. The `light_groups` and `light_group_members` tables already provide everything the client needs via `GET /api/sensors`.

## API

No new endpoints. Existing endpoints are reused:

- `GET /api/sensors` — already returns `groupId` / `groupName` per light.
- `DELETE /api/light-groups/{id}/members/{sensorId}` (or equivalent existing membership-removal endpoint) — used by the "Remove from group" action in the guard dialog. The exact endpoint will be confirmed during planning.
- `PATCH /api/sensors/[id]` — used unchanged for the room move once confirmed.
- `POST /api/sensors` — used unchanged for first-time assignment of an unmaterialized Hue light.

## Acceptance Criteria

- [ ] Trying to move a grouped light to another room from the kebab opens the guard dialog and never sends a `PATCH room_id` request.
- [ ] The guard dialog names the specific group the light is in.
- [ ] **Remove from group** in the guard dialog clears the membership; afterward, re-opening the kebab and picking a room moves the light normally (via the move-confirmation dialog).
- [ ] Trying to remove a grouped light from its room via the kebab triggers the same guard.
- [ ] Picking a room from the kebab on a non-grouped light always opens the confirmation dialog before any state change.
- [ ] The confirmation dialog shows the light's name, source room (or "Unassigned"), and target room.
- [ ] **Cancel** in either dialog leaves the database and UI unchanged.
- [ ] **Move** / **Remove** / **Add to room** in the confirmation dialog performs the action and refreshes the list.
- [ ] First-time assignment of an unassigned Hue light goes through the same confirmation dialog (worded as "Add to room?").
- [ ] No regressions to the dashboard tile menus or the room "Add device" flow.

## Open Questions

- Exact wording / icon choices for the dialogs are deferred to implementation review.

## Resolved Decisions

- **Two-step flow for grouped lights, not a combined "Remove from group and move".** Each consequence (group membership removal, then room move) is surfaced separately so the user explicitly acknowledges what they are breaking. A combined action would hide the group deletion behind a "Move" button — exactly the silent data loss this feature exists to prevent.
- **No "don't ask again" preference for the move confirmation.** Room reassignment is a rare action; the friction of confirming each move is negligible and the cost of an accidental move is the very problem being solved. Revisit only if users report the confirmation as a pain point.
