#!/usr/bin/env bash
# Tests for: warren clear

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TESTS_DIR/../.." && pwd)"
DOCKER_DIR="$REPO_ROOT/docker"
WARREN="$REPO_ROOT/warren"

source "$TESTS_DIR/lib/assert.sh"

echo "--- test_clear ---"

INFLUXDB_TOKEN_FILE="$DOCKER_DIR/admin.token"
MQTT_PASSWORDFILE="$DOCKER_DIR/mosquitto/config/passwordfile"
UI_ENV="$REPO_ROOT/nextjs-ui/.env"
SENSOR_SECRETS="$REPO_ROOT/firmware/sensor/include/secrets.h"
CAMERA_SECRETS="$REPO_ROOT/firmware/camera/include/secrets.h"
SQLITE_DATA_DIR="$REPO_ROOT/nextjs-ui/.data"
COMPOSE_ENV="$DOCKER_DIR/.env"
CADDY_FILE="$DOCKER_DIR/caddy/Caddyfile"
CA_CERT_HOST="$DOCKER_DIR/tls/ca.crt"
CA_CERT_SITE="$DOCKER_DIR/caddy/site/ca.crt"

if [[ ! -f "$INFLUXDB_TOKEN_FILE" ]]; then
    echo "  SKIP: docker/admin.token not found — run 'warren setup' first"
    return 0 2>/dev/null || exit 0
fi

# Run clear with "YES" piped
printf 'YES\n' | "$WARREN" clear

assert_no_file "$INFLUXDB_TOKEN_FILE"  "docker/admin.token deleted"
assert_no_file "$MQTT_PASSWORDFILE"    "docker/mosquitto/config/passwordfile deleted"
assert_no_file "$UI_ENV"               "nextjs-ui/.env deleted"
assert_no_file "$SENSOR_SECRETS"       "firmware/sensor/include/secrets.h deleted"
assert_no_file "$CAMERA_SECRETS"       "firmware/camera/include/secrets.h deleted"
assert_no_dir  "$SQLITE_DATA_DIR"      "nextjs-ui/.data/ deleted"

# Named volumes must be gone
volumes="$(docker volume ls --format '{{.Name}}')"
if echo "$volumes" | grep -q "node_red_data"; then
    echo "  FAIL: node_red_data volume still exists after clear" >&2
    ((failed++))
else
    echo "  PASS: node_red_data volume removed"
    ((passed++))
fi
if echo "$volumes" | grep -q "influxdb3_data"; then
    echo "  FAIL: influxdb3_data volume still exists after clear" >&2
    ((failed++))
else
    echo "  PASS: influxdb3_data volume removed"
    ((passed++))
fi
if echo "$volumes" | grep -qE '(^|_)caddy_data$'; then
    echo "  FAIL: caddy_data volume still exists after clear" >&2
    ((failed++))
else
    echo "  PASS: caddy_data volume removed"
    ((passed++))
fi
if echo "$volumes" | grep -qE '(^|_)warren_ui_data$'; then
    echo "  FAIL: warren_ui_data volume still exists after clear" >&2
    ((failed++))
else
    echo "  PASS: warren_ui_data volume removed"
    ((passed++))
fi

assert_no_file "$COMPOSE_ENV"   "docker/.env deleted"
assert_no_file "$CADDY_FILE"    "docker/caddy/Caddyfile deleted"
assert_no_file "$CA_CERT_HOST"  "docker/tls/ca.crt deleted"
assert_no_file "$CA_CERT_SITE"  "docker/caddy/site/ca.crt deleted"

# No running containers
running="$(cd "$DOCKER_DIR" && docker compose ps --services --filter status=running)"
assert_eq "$running" "" "no services running after clear"

# flows.json should be reset to the template placeholder
if grep -q 'apiv3_REPLACE_ME_BY_WARREN_SETUP' "$DOCKER_DIR/nodered/flows.json" 2>/dev/null; then
    echo "  PASS: flows.json reset from template"
    ((passed++))
else
    echo "  FAIL: flows.json does not contain the template placeholder token" >&2
    ((failed++))
fi

# Abort on wrong confirmation
output="$(printf 'no\n' | "$WARREN" clear 2>&1 || true)"
assert_output_contains "$output" "Aborted" "clear aborts on non-YES input"

# --help exits 0
assert_cmd "clear --help exits 0" "$WARREN" clear --help
