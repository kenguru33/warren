# Feature Spec: Better Room Item Layout

## Overview

The dashboard currently renders every item inside a room card as an equal-sized tile in a fixed two-column grid. As rooms accumulate a mix of climate sensors, motion sensors, cameras, ungrouped Hue lights, and light groups, the layout becomes noisy and inefficient: cameras feel cramped, lights dominate vertical space, and there is no visual hierarchy between "ambient state" (temperature, humidity, motion) and "controllable things" (lights, light groups). On wider screens the rigid two-column grid also leaves rooms looking sparse, while on narrow screens dense rooms scroll uncomfortably.

This feature redesigns the in-room layout so items are arranged by category and importance, scale appropriately to the type of content (small status tiles vs. media-rich camera tiles), and adapt sensibly to room size and viewport width.

## Goals

- Give each item type a tile size and shape that matches its content (compact status for sensors, larger media for cameras, control-shaped tile for light groups, smaller chips for individual lights).
- Group items inside a room into clear visual sections so users can scan a room at a glance: climate, security/motion, cameras, lights.
- Make the layout responsive across viewport widths without forcing the same two-column grid everywhere.
- Keep the existing edit-mode interactions (per-tile edit/remove buttons, group-lights affordance, target sliders) functional and visually consistent in the new layout.
- Reduce wasted vertical space in rooms with many lights, and stop rooms with one large item from looking lopsided.

## Non-Goals

- Changing how rooms themselves are arranged on the dashboard (the room grid `pages/index.vue` lays out room cards — out of scope here).
- Adding new item types, new sensor capabilities, or changing the underlying data model.
- Reworking the sensor edit modals, history modal, live-stream modal, or group modal.
- Changing the room edit panel's target temperature/humidity controls beyond what is needed to keep them visually consistent with the new tile layout.
- Reworking the camera streaming behavior or motion detection logic.

## User Stories

- As a user looking at the dashboard, I want to quickly find the temperature, humidity, and motion state of a room, so that I can see at a glance whether the room's environment is healthy.
- As a user with several Hue lights in one room, I want individual lights to take less space than climate tiles, so that a room with many lights does not become an unreadable wall of toggles.
- As a user with a camera in a room, I want the live-snapshot tile to be visually prominent, so that I can recognize the scene without enlarging the modal.
- As a user managing a room with a single sensor, I want the room card to look balanced rather than half-empty, so that the dashboard feels deliberate.
- As a user editing a room, I want the per-tile edit/remove controls and the "group lights" affordance to remain easy to reach, so that the redesign does not make administration harder.

## Functional Requirements

### Sectioning Within a Room

- A room card visually segments its items into ordered sections: Climate (temperature, humidity), Motion, Cameras, Light Groups, Individual Lights.
- Sections that have no items are omitted entirely; an empty room continues to render the same empty-state behavior as today.
- Section headings or separators must not introduce significant vertical bulk for rooms with only one or two items.

### Tile Sizing and Shape

- Climate tiles (temperature, humidity) keep a compact square/portrait status form factor sized for a single value, target, deviation, and relay indicators.
- Motion tiles share the climate tile size and shape so the ambient-state row reads as one strip.
- Camera tiles are larger than status tiles, with an aspect ratio that flatters the snapshot/live overlay rather than cropping it heavily.
- Light groups get a tile that signals "group control" and is visually distinct from a single light.
- Individual ungrouped lights render as smaller chips/tiles than climate tiles, so a room with many lights does not balloon vertically.

### Responsive Behavior

- The internal layout adapts to the room card's available width, not just to viewport breakpoints, since rooms themselves are arranged in a parent grid that may put one or two rooms per row depending on viewport.
- On narrow widths the layout collapses gracefully: tiles wrap, no horizontal scrolling, no clipped values.
- On wider widths the layout uses the extra space (e.g., more lights per row, larger camera tile) instead of leaving whitespace.

### Edit Mode Compatibility

- Per-tile edit and remove buttons remain reachable on every tile type (climate, motion, camera, light, light group) in the new layout, including on the smaller individual-light chips.
- The "Group lights" affordance still appears under the room when in edit mode and there are at least two ungrouped lights.
- The target temperature/humidity edit panel below the sensor area continues to appear when climate sensors are present.

### Behavior Preservation

- Clicking a climate, humidity, or motion tile still opens the sensor history modal.
- Clicking a camera tile still opens the live-stream modal.
- Toggling an ungrouped Hue light or a light group from its tile still controls the bulb/group as it does today.
- The relay (heater/fan) indicators on the temperature tile, the offline state styling and badge, the motion "Detected/Clear" state and recent-motion accent, and the camera motion badge are all preserved in the new tile designs.
- The room-level master light toggle and header actions (add sensor, edit room, delete room) keep their current placement and behavior.

## UI / UX

The redesign affects only what is rendered inside `RoomCard.vue` between the header and the edit panel. Outside the card, the dashboard's room grid is unchanged.

Suggested visual direction (final design to be confirmed during implementation):

- A top "ambient strip" containing temperature, humidity, and motion side by side as compact status tiles. This strip should feel like a single readout, not three independent cards.
- A camera area below the ambient strip, prominently sized when a camera is present in the room.
- A "lighting" area at the bottom containing light groups followed by individual ungrouped lights. Light groups render as medium tiles; individual lights as small chips that pack multiple per row.
- Section transitions are conveyed via spacing and subtle dividers rather than loud headings, to keep the card visually quiet.
- Edit-mode affordances (per-tile edit/remove, the dashed "Group lights" button) keep the same iconography and color treatments as today; only their placement may change to suit the new tile sizes.

## Data Model

No data model changes. This is a purely presentational refactor of how existing `RoomWithSensors` data (sensors, light groups, references, master state) is rendered.

## API

No API changes. All endpoints currently consumed by `RoomCard.vue` and its child tile components (`HueLightTile.vue`, `LightGroupTile.vue`, `CameraCard.vue` if reused, `MasterLightToggle.vue`) continue to be used as-is.

## Acceptance Criteria

- [ ] A room with temperature, humidity, motion, a camera, two light groups, and several ungrouped lights renders with clear visual sections in the order: ambient (climate + motion), camera, lighting (groups then individual lights).
- [ ] Climate tiles, the motion tile, the camera tile, light group tiles, and individual light chips each have visibly distinct sizes appropriate to their content.
- [ ] A room with only a temperature sensor does not look half-empty; the card balances around its single item.
- [ ] A room with eight or more ungrouped Hue lights fits them compactly without dominating the room's vertical space.
- [ ] Resizing the browser from a wide desktop width to a phone width never produces clipped values, horizontal scroll within the card, or overlapping tiles.
- [ ] In edit mode, every tile (including small light chips) exposes its edit and remove controls, the "Group lights" button still appears when there are at least two ungrouped lights, and the target temperature/humidity edit panel still appears when climate sensors are present.
- [ ] Clicking any tile produces the same modal/control action it does today (history, live stream, light toggle).
- [ ] Offline state (red-tinted background, "Offline" badge, dimmed value), heater/fan relay indicators on the temperature tile, recent-motion accent on the motion tile, and the camera "Motion" badge all remain visible and correct in the new layout.
- [ ] The room header (name, master toggle, add/edit/delete buttons) retains its current placement and behavior.

## Open Questions

- Should ambient items be a fixed three-up strip even when only one or two are present, or should they reflow to fill the row?
- How prominent should the camera tile be when there is more than one camera in a room — should multiple cameras share one row, stack, or wrap?
- Should section dividers be invisible (spacing only), subtle hairlines, or include small text labels ("Climate", "Lighting") for clarity?
- Should the master light toggle in the header gain visual coupling to the new lighting section (e.g., shared accent color), or stay purely in the header?
- When a room contains only lights (no climate, no motion, no camera), should the lighting section expand to use the full card area, or should the card visibly indicate the absence of ambient sensors?
