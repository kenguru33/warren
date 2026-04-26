#!/usr/bin/env bash
# Tests for: warren start / warren stop

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TESTS_DIR/../.." && pwd)"
DOCKER_DIR="$REPO_ROOT/docker"
WARREN="$REPO_ROOT/warren"

source "$TESTS_DIR/lib/assert.sh"

echo "--- test_start_stop ---"

INFLUXDB_TOKEN_FILE="$DOCKER_DIR/admin.token"

if [[ ! -f "$INFLUXDB_TOKEN_FILE" ]]; then
    echo "  SKIP: docker/admin.token not found — run 'warren setup' first"
    return 0 2>/dev/null || exit 0
fi

# Start the stack (production mode — no UI process since .output may not exist)
(cd "$DOCKER_DIR" && docker compose up -d) 2>&1 | tail -5

# Verify all 4 services are running
running="$(cd "$DOCKER_DIR" && docker compose ps --services --filter status=running)"

assert_output_contains "$running" "influxdb3"       "influxdb3 running"
assert_output_contains "$running" "influxdb3-explorer" "influxdb3-explorer running"
assert_output_contains "$running" "nodered"         "nodered running"
assert_output_contains "$running" "mosquitto"       "mosquitto running"

# Stop the stack
(cd "$DOCKER_DIR" && docker compose stop)

# No containers should be running
running_after="$(cd "$DOCKER_DIR" && docker compose ps --services --filter status=running)"
assert_eq "$running_after" "" "no services running after stop"

# Named volumes must survive stop
assert_cmd "node_red_data volume exists" \
    docker volume inspect "$(cd "$DOCKER_DIR" && docker compose config --format json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(list(d["volumes"].keys())[0])')" 2>/dev/null \
    || true

# Simpler volume check
volumes="$(docker volume ls --format '{{.Name}}')"
assert_output_contains "$volumes" "node_red_data"   "node_red_data volume survives stop"
assert_output_contains "$volumes" "influxdb3_data"  "influxdb3_data volume survives stop"

# --help exits 0
assert_cmd "start --help exits 0" "$WARREN" start --help
assert_cmd "stop --help exits 0"  "$WARREN" stop  --help
