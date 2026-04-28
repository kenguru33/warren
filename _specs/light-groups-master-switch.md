# Feature Spec: Light Groups with Master Switch

## Overview

Today, every light in a room is controlled individually from the room card or the Lights page — turning the whole room on or off means tapping each tile. This feature lets a user define one or more named light groups inside a room and operate every light in a group with a single master switch (on/off and brightness). Groups live in Warren — they are not the same as Hue rooms or Hue groups defined in the Philips Hue app.

## Goals

- Let users group two or more lights inside the same room and give the group a name.
- Provide a master toggle and a master brightness slider per group that applies to every light in the group.
- Show clear group state on the room dashboard: all-on, all-off, or mixed.
- Keep individual light controls available — group control is additive, not exclusive.
- Work for any light Warren currently controls (today: Philips Hue lights via the existing integration).

## Non-Goals

- Cross-room groups. A group lives inside exactly one room; lights from different rooms cannot be combined.
- Pushing the group concept back to the Hue Bridge as a Hue group. Groups are Warren-only.
- Scenes, schedules, or automations on top of groups (e.g. "turn this group on at sunset"). Out of scope.
- Color or color-temperature sync across the group. Master controls cover on/off and brightness only.
- Grouping non-light devices (cameras, sensors). Lights only.
- Bulk-creation patterns ("make every light in every room a single group"). Single-group, single-room creation only.

## User Stories

- As a user, I want to create a "Reading nook" group in the living room from the two lamps near the sofa, so that I can turn them both on with one tap.
- As a user, I want to set the brightness of an entire group with a single slider, so that I don't have to drag three separate sliders to the same level.
- As a user, I want to see at a glance whether every light in a group is on, off, or some mix, so that I know what the master switch will do next.
- As a user, I want to add a light to or remove a light from an existing group without re-creating the group, so that I can adjust groupings as my room changes.
- As a user, I want to delete a group when I no longer need it, without losing the underlying lights, so that the lights remain controllable individually afterward.
- As a user managing multiple lights, I want a light to belong to at most one group in a room (or none), so that group state is unambiguous.

## Functional Requirements

### Group definition

- A group belongs to exactly one room.
- A group has a user-defined name (bounded length so the UI doesn't break) and contains one or more lights from the same room.
- A given light can be a member of at most one group at any time.
- A room can have zero, one, or many groups. Lights not assigned to any group remain individually controllable as today.
- Groups are persisted: they survive stack restarts, light disconnect/re-pair (if the underlying light identifier is unchanged), and Hue Bridge re-pairing.
- Removing a light from its room removes it from any group it belonged to. If that leaves a group empty, the group is removed automatically.
- Deleting a group does not delete its lights; they revert to ungrouped within the same room.

### Master controls

- Each group has a master on/off toggle that applies to every light in the group.
  - Pressing master-on turns every light in the group on at the brightness it last had (or the bridge default if no last brightness is known).
  - Pressing master-off turns every light in the group off.
- Each group has a master brightness slider that applies to every light in the group capable of brightness.
  - Setting the slider also turns the group on if it was off (matching the existing per-light behavior).
  - Lights in the group that do not support brightness (on/off only) are unaffected by the slider but still respond to the master toggle.
- Master controls are best-effort: if some lights in the group are unreachable, the operation succeeds for the reachable ones and surfaces a partial-failure indicator for the rest. The group is not "all or nothing".

### Group state

- The displayed group state is one of: `all-on`, `all-off`, `mixed`.
- `mixed` is shown when at least one light in the group is on and at least one is off.
- Unreachable lights are excluded from the on/off computation but contribute to a separate "n unreachable" indicator on the group tile.
- The brightness shown on the master slider is a single representative value: the average brightness of the lights that are currently on and brightness-capable (rounded), or empty if none.

### Sync behavior

- Master commands are issued per underlying light through the existing per-light control path (no new bridge concept). The poller continues to refresh per-light state on its normal cadence; the group's displayed state is computed from those values.
- Renaming a group, adding/removing members, or deleting a group does not require a poll cycle — the change is reflected in the UI immediately.

### Search and filtering

- The Lights page treats group membership as searchable: typing the group name surfaces every light in that group.
- The room dashboard surfaces the group as its own tile alongside individual lights, with the group name as the tile title.

## UI / UX

- On the room card, a group appears as a single tile (visually distinct from an individual-light tile) showing:
  - The group name (prominent).
  - The number of members and a compact state indicator (`3 on`, `all off`, `mixed`).
  - A master toggle.
  - A master brightness slider for groups whose members support brightness.
  - A subtle "n unreachable" badge when at least one member is unreachable.
- Individual-light tiles for grouped lights remain visible by default but are visually marked as "in group: <Group Name>" so the user understands the relationship. Clicking through to per-light controls still works.
- Group editing happens from the room card in edit mode (matching the existing edit-mode pattern):
  - "+ Group lights" affordance opens a small modal where the user picks two or more lights from the room and gives the group a name.
  - On an existing group tile, the edit affordance opens the same modal pre-filled, allowing rename, add/remove members, or delete.
- Validation surfaces inline:
  - Empty name → "Group needs a name".
  - Fewer than two members selected → "Pick at least two lights".
  - A light already in another group cannot be selected for a new one (it's shown disabled with a hint "in group: <Other Group Name>").
- The Lights page also shows group membership on each light row (small label next to the existing room name) so users browsing flat can see the grouping.
- Optimistic feedback: master toggle/slider updates the displayed group state immediately and rolls back on hard failure, consistent with the existing per-light pattern.

## Data Model

- A new persistent representation is needed for "a group of lights inside a room", with stable identity across restarts:
  - Group identity, the room it belongs to, a user-defined name, and creation timestamp.
  - A membership relation linking a group to each light it contains, keyed by the light's stable Warren identifier.
  - Membership uniqueness: a light cannot appear in two groups simultaneously.
- API responses that surface a room's contents include groups alongside individual lights, with each group exposing its name, member identifiers, computed state (`all-on`/`all-off`/`mixed`), representative brightness, and unreachable-count.
- Existing per-light response shapes pick up an optional pointer back to the group they belong to (so the UI can show "in group: <name>" without a second lookup).

## API

- A new endpoint to create a group within a room: takes a name and a list of light identifiers, validates room/membership rules, returns the new group.
- A new endpoint to update a group: rename it and/or change its membership list (single endpoint covers both rather than separate add/remove sub-resources).
- A new endpoint to delete a group: removes the group and frees its members, leaves the underlying lights untouched.
- A new endpoint to drive the master controls for a group: accepts an on/off value and/or a brightness percentage, fans out to each member light, and returns a per-member success/failure summary.
- Existing endpoints that return room or sensor data (`/api/rooms`, `/api/sensors`) gain group-membership information without breaking existing fields.

## Acceptance Criteria

- [ ] A user can create a group of two or more lights from the same room, give it a name, and see it appear as a tile on the room card.
- [ ] Tapping the group's master toggle turns every member light on (or off) in a single action, with the room card and the Lights page reflecting the new state without a manual reload.
- [ ] Adjusting the group's master brightness slider sets every brightness-capable member to that level, and turns the group on if it was off.
- [ ] The group tile correctly shows `all-on`, `all-off`, or `mixed`, including after one member is toggled individually outside the group.
- [ ] A user can rename a group and add or remove members without losing the rest of the group.
- [ ] A user can delete a group; its lights remain in the room and are individually controllable.
- [ ] A light cannot be assigned to two groups at once; the UI prevents it and the API rejects it with a clear error.
- [ ] When a member light is unreachable, the master command succeeds for the reachable members and the tile shows an "n unreachable" indicator.
- [ ] Group definitions persist across stack restarts.
- [ ] Removing a light from its room also removes it from any group; if the group becomes empty as a result, it is deleted automatically.
- [ ] Search on the Lights page matches group names and surfaces members.

## Open Questions

- Should a group's name be required to be unique within a room? Default proposal: yes, to avoid two "Reading nook" tiles in the same room.
- When the user adjusts the master brightness, should already-off lights stay off, or come on at the new level? This spec says "turn on" for symmetry with the per-light slider. Confirm.
- For mixed-capability groups (e.g. one dimmable + one on/off-only light), should the master slider be disabled, hidden, or visible-but-affecting-only-dimmables? Default proposal: visible-but-affecting-only-dimmables, with a small note in the edit modal.
- Should a per-member "exclude from group commands temporarily" toggle exist, or is removing the member from the group enough? Default: removal is enough; revisit if requested.
- Should master-on restore each light to its individually remembered last brightness, or apply the group's last master brightness? Default: each light's own last brightness, to avoid clobbering per-light tuning. Confirm.
- Should there be an audit/log of group changes (created, renamed, deleted)? For a single-user home setup likely overkill, worth confirming.
- Is there a future need to expose groups to ESP32-controlled lights (when/if added), or to mirror Warren groups as Hue groups on the bridge? Out of scope for this iteration; flag for a future spec.
