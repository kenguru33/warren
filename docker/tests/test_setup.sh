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

# Run setup with synthetic answers piped via stdin
printf 'test-ssid\ntest-wifi-pass\ntest-ui-pass\n127.0.0.1\n' \
    | "$WARREN" setup

assert_file "$INFLUXDB_TOKEN_FILE"     "docker/admin.token"
assert_file "$MQTT_PASSWORDFILE"       "docker/mosquitto/config/passwordfile"
assert_file "$MQTT_CONF"               "docker/mosquitto/config/mosquitto.conf"
assert_file "$NODERED_FLOWS"           "docker/nodered/flows.json"
assert_file "$UI_ENV"                  "ui/.env"
assert_file "$SENSOR_SECRETS"          "firmware/sensor/include/secrets.h"
assert_file "$CAMERA_SECRETS"          "firmware/camera/include/secrets.h"

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
