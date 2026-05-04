#!/usr/bin/env bash
# Tests for: warren setup

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TESTS_DIR/../.." && pwd)"
WARREN="$REPO_ROOT/warren"

source "$TESTS_DIR/lib/assert.sh"

echo "--- test_setup ---"

INFLUXDB_TOKEN_FILE="$REPO_ROOT/docker/admin.token"
MQTT_PASSWORDFILE="$REPO_ROOT/docker/mosquitto/config/passwordfile"
MQTT_CONF="$REPO_ROOT/docker/mosquitto/config/mosquitto.conf"
NODERED_FLOWS="$REPO_ROOT/docker/nodered/flows.json"
UI_ENV="$REPO_ROOT/ui/.env"
SENSOR_SECRETS="$REPO_ROOT/firmware/sensor/include/secrets.h"
CAMERA_SECRETS="$REPO_ROOT/firmware/camera/include/secrets.h"

# Guard: abort if already set up (don't clobber a real installation)
if [[ -f "$INFLUXDB_TOKEN_FILE" ]]; then
    echo "  SKIP: docker/admin.token exists — run 'warren clear' before running setup tests"
    return 0 2>/dev/null || exit 0
fi

# Run setup with synthetic answers piped via stdin.
# Order: WIFI_SSID, WIFI_PASS, UI_PASS, BACKEND_HOST,
#        Let's-Encrypt? (n = local-CA mode), Custom-hostname? (n = IP only).
printf 'test-ssid\ntest-wifi-pass\ntest-ui-pass\n127.0.0.1\nn\nn\n' \
    | "$WARREN" setup

assert_file "$INFLUXDB_TOKEN_FILE"     "docker/admin.token"
assert_file "$MQTT_PASSWORDFILE"       "docker/mosquitto/config/passwordfile"
assert_file "$MQTT_CONF"               "docker/mosquitto/config/mosquitto.conf"
assert_file "$NODERED_FLOWS"           "docker/nodered/flows.json"
assert_file "$UI_ENV"                  "ui/.env"
assert_file "$SENSOR_SECRETS"          "firmware/sensor/include/secrets.h"
assert_file "$CAMERA_SECRETS"          "firmware/camera/include/secrets.h"

# mosquitto.conf must enable the MQTTS listener on 8883.
if grep -q '^listener 8883' "$MQTT_CONF" 2>/dev/null; then
    echo "  PASS: mosquitto.conf has MQTTS listener on 8883"
    ((passed++))
else
    echo "  FAIL: mosquitto.conf missing 'listener 8883'" >&2
    ((failed++))
fi

# secrets.h must point firmware at MQTTS + HTTPS.
if grep -q '^#define MQTT_PORT' "$SENSOR_SECRETS" 2>/dev/null; then
    echo "  PASS: sensor secrets.h defines MQTT_PORT"
    ((passed++))
else
    echo "  FAIL: sensor secrets.h missing MQTT_PORT" >&2
    ((failed++))
fi
if grep -q '^#define BACKEND_URL.*"https://' "$SENSOR_SECRETS" 2>/dev/null; then
    echo "  PASS: sensor secrets.h BACKEND_URL is https://"
    ((passed++))
else
    echo "  FAIL: sensor secrets.h BACKEND_URL not https" >&2
    ((failed++))
fi
if grep -q '^#define BACKEND_URL.*"https://' "$CAMERA_SECRETS" 2>/dev/null; then
    echo "  PASS: camera secrets.h BACKEND_URL is https://"
    ((passed++))
else
    echo "  FAIL: camera secrets.h BACKEND_URL not https" >&2
    ((failed++))
fi

# Capture token for idempotency check
original_token="$(cat "$INFLUXDB_TOKEN_FILE")"

# Second run without --force must fail
assert_cmd_fails "setup refuses to overwrite existing credentials" \
    bash -c "echo '' | \"$WARREN\" setup"

# Token must be unchanged
current_token="$(cat "$INFLUXDB_TOKEN_FILE")"
assert_eq "$current_token" "$original_token" "token unchanged after refused second setup"

# --help exits 0
assert_cmd "setup --help exits 0" "$WARREN" setup --help
