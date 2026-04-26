#!/usr/bin/env bash
# Tests for: warren restart

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TESTS_DIR/../.." && pwd)"
DOCKER_DIR="$REPO_ROOT/docker"
WARREN="$REPO_ROOT/warren"

source "$TESTS_DIR/lib/assert.sh"

echo "--- test_restart ---"

INFLUXDB_TOKEN_FILE="$DOCKER_DIR/admin.token"

if [[ ! -f "$INFLUXDB_TOKEN_FILE" ]]; then
    echo "  SKIP: docker/admin.token not found — run 'warren setup' first"
    return 0 2>/dev/null || exit 0
fi

_services_running() {
    cd "$DOCKER_DIR" && docker compose ps --services --filter status=running
}

# Ensure stack is up before testing restart
(cd "$DOCKER_DIR" && docker compose up -d) 2>&1 | tail -3

# Single-service restart: mosquitto
(cd "$DOCKER_DIR" && docker compose restart mosquitto)
running="$(_services_running)"
assert_output_contains "$running" "mosquitto" "mosquitto running after single-service restart"
assert_output_contains "$running" "nodered"   "nodered still running after mosquitto restart"

# --help exits 0
assert_cmd "restart --help exits 0" "$WARREN" restart --help

# Full restart via docker compose (avoids needing the UI .output dir in CI)
(cd "$DOCKER_DIR" && docker compose stop)
(cd "$DOCKER_DIR" && docker compose up -d) 2>&1 | tail -3
running_after="$(_services_running)"
assert_output_contains "$running_after" "influxdb3"  "influxdb3 running after full restart"
assert_output_contains "$running_after" "mosquitto"  "mosquitto running after full restart"

# Clean up
(cd "$DOCKER_DIR" && docker compose stop)
