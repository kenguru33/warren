# Spec for firmware-wifi-fallback-wokwi

branch: claude/feature/firmware-wifi-fallback-wokwi

> **Status: Already implemented.** Both firmware projects contain the full WiFi fallback logic described below. No code changes are needed.

## Summary

Both firmware projects (sensor and camera) attempt to connect to the primary WiFi network defined in `secrets.h`. If the connection does not succeed within a timeout, they automatically fall back to the Wokwi simulator's built-in guest network (`Wokwi-GUEST`) with an empty password. This allows the firmware to run in the Wokwi simulator without any changes to `secrets.h` or the build configuration.

## Implementation

The logic lives in `wifi_connect.h` (present in both projects):

- `tryConnectSSID(ssid, pass, timeoutMs)` — attempts one SSID; returns false immediately if SSID is empty
- `connectWithFallback(ssid, pass)` — tries primary (15 s timeout), then `Wokwi-GUEST` (10 s timeout); logs each stage to serial

Call sites:
- **Sensor** — `ensureWiFiConnected()` in `firmware/sensor/src/main.cpp`, called at startup and whenever WiFi is lost
- **Camera** — `connectWiFi()` in `firmware/camera/src/main.cpp`, called at startup and polled every 5 s

## Functional Requirements

- On boot, the firmware first attempts to connect to the primary WiFi (SSID and password from `secrets.h`).
- If the primary connection fails after a defined timeout, the firmware automatically retries using the Wokwi simulator network SSID `Wokwi-GUEST` with an empty password.
- The fallback attempt also uses a timeout. If it also fails, the firmware logs a failure to serial.
- The active network (primary or fallback) is logged to the serial console.
- The fallback logic is present in both the `sensor` and `camera` firmware projects.
- No code change or manual reconfiguration is required to switch between real hardware and the Wokwi simulator.

## Possible Edge Cases

- Primary SSID is empty or not set in `secrets.h` — skips directly to fallback attempt. ✓ handled
- Both primary and fallback connections fail — firmware returns false from `connectWithFallback`; callers handle accordingly. ✓ handled
- Wokwi-GUEST is available on real hardware — firmware would connect to it if the primary fails; acceptable trade-off for development tooling.
- Password for primary WiFi contains special characters — no encoding issues; passed as-is to the WiFi library.

## Acceptance Criteria

- Flashing the sensor firmware to real hardware with a valid `secrets.h` connects to the primary WiFi network.
- Running the sensor firmware in Wokwi with a valid `secrets.h` for a non-existent network falls back to `Wokwi-GUEST` and connects successfully.
- Running the camera firmware in Wokwi with a valid `secrets.h` for a non-existent network falls back to `Wokwi-GUEST` and connects successfully.
- The serial console shows which network was used for the connection.
- If both connections fail, the serial console reports the failure.

## Open Questions

- ~~Should the connection timeout for the primary network be configurable?~~ Already configurable via `WIFI_PRIMARY_TIMEOUT_MS` and `WIFI_FALLBACK_TIMEOUT_MS` in `wifi_connect.h`.
- ~~Should the fallback SSID/password be defined as constants?~~ Hardcoded in `wifi_connect.h` as `"Wokwi-GUEST"` / `""`.
- ~~Should the firmware retry the primary network after falling back?~~ No; stays on `Wokwi-GUEST` until reboot or next `connectWithFallback` call.

## Testing Guidelines

Unit tests already exist in both projects at `test/test_wifi_fallback/test_main.cpp`:

- `test_primary_succeeds` — primary network connection attempt succeeds; fallback never tried.
- `test_fallback_when_primary_fails` — primary fails; fallback to `Wokwi-GUEST` succeeds.
- `test_both_fail` — both attempts fail; `connectWithFallback` returns false.
- `test_empty_ssid_skips_to_fallback` — empty primary SSID skips directly to `Wokwi-GUEST`.

Run with: `pio test -e native` in each firmware project directory.
