# Feature Spec: Sensor Pin4 Heater Relay

## Overview

Currently the sensor firmware controls a fan relay on GPIO 4 and a heater relay on GPIO 19. The pin assignments are wrong for the intended physical wiring — GPIO 4 should drive the heater, not the fan. This spec corrects the relay assignment so that GPIO 4 turns the heater on and off using the configured temperature thresholds as triggers.

## Goals

- Reassign GPIO 4 to control the heater relay
- Ensure heater switching logic uses the existing runtime config thresholds (heaterOnOffset, heaterOffOffset)

## Non-Goals

- Changing the threshold logic itself
- Changing the fan relay pin or fan control behaviour
- Any UI or backend changes

## User Stories

- As an operator, I want GPIO 4 to control the heater relay so that the physical wiring matches the firmware behaviour

## Functional Requirements

### Pin Assignment

- GPIO 4 must be configured as the heater relay output
- The heater relay must switch on/off based on the heaterOnOffset and heaterOffOffset thresholds relative to the target temperature

### Threshold Triggers

- Heater turns ON when measured temperature falls below `refTemp − heaterOnOffset`
- Heater turns OFF when measured temperature rises above `refTemp + heaterOffOffset`
- When `refTemp` is not set (NAN), fall back to the hardcoded absolute thresholds (18 °C on, 22 °C off)

## UI / UX

No UI changes required.

## Data Model

No data model changes required.

## API

No API changes required.

## Acceptance Criteria

- [ ] GPIO 4 drives the heater relay (not the fan)
- [ ] Heater turns ON when temperature drops below the configured lower threshold
- [ ] Heater turns OFF when temperature rises above the configured upper threshold
- [ ] Fallback to hardcoded thresholds (18/22 °C) when no target temperature is configured
- [ ] No regression in fan relay behaviour on its assigned pin

## Open Questions

- What pin should the fan relay move to, if any, or is the fan relay being removed entirely?
