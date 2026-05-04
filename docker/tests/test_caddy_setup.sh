#!/usr/bin/env bash
# Tests for: warren setup — Caddy local-CA bootstrap.
#
# Verifies that setup (in default local-CA mode) materializes:
#   - docker/.env with WARREN_TLS_MODE=local
#   - docker/caddy/Caddyfile (rendered from the committed local template)
#   - docker/tls/ca.crt and docker/caddy/site/ca.crt (the local CA root)
#   - caddy_data named volume

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TESTS_DIR/../.." && pwd)"
DOCKER_DIR="$REPO_ROOT/docker"

source "$TESTS_DIR/lib/assert.sh"

echo "--- test_caddy_setup ---"

CA_CERT_HOST="$DOCKER_DIR/tls/ca.crt"
CA_CERT_SITE="$DOCKER_DIR/caddy/site/ca.crt"
COMPOSE_ENV="$DOCKER_DIR/.env"
CADDY_FILE="$DOCKER_DIR/caddy/Caddyfile"

# Skip if setup hasn't run yet.
if [[ ! -f "$DOCKER_DIR/admin.token" ]]; then
    echo "  SKIP: docker/admin.token not found — run 'warren setup' first"
    return 0 2>/dev/null || exit 0
fi

assert_file "$COMPOSE_ENV"   "docker/.env"
assert_file "$CADDY_FILE"    "docker/caddy/Caddyfile rendered"
assert_file "$CA_CERT_HOST"  "docker/tls/ca.crt extracted from Caddy"
assert_file "$CA_CERT_SITE"  "docker/caddy/site/ca.crt copy for /ca.crt route"

# WARREN_TLS_MODE recorded
mode="$(grep -m1 '^WARREN_TLS_MODE=' "$COMPOSE_ENV" 2>/dev/null | cut -d= -f2-)"
assert_eq "$mode" "local" "WARREN_TLS_MODE=local in docker/.env"

# Caddyfile must be the local-CA template (uses static cert files we generated)
if grep -q '/etc/caddy/tls/server.crt' "$CADDY_FILE" 2>/dev/null; then
    echo "  PASS: Caddyfile points at /etc/caddy/tls/server.crt (local-CA mode)"
    ((passed++))
else
    echo "  FAIL: Caddyfile does not reference the static server cert" >&2
    ((failed++))
fi

# Server cert was generated and includes the LAN IP as a SAN
SRV_CRT="$DOCKER_DIR/tls/server.crt"
SRV_KEY="$DOCKER_DIR/tls/server.key"
assert_file "$SRV_CRT" "docker/tls/server.crt"
assert_file "$SRV_KEY" "docker/tls/server.key"

lan_ip="$(grep -m1 '^WARREN_LAN_IP=' "$COMPOSE_ENV" 2>/dev/null | cut -d= -f2-)"
if [[ -n "$lan_ip" ]] && openssl x509 -in "$SRV_CRT" -noout -ext subjectAltName 2>/dev/null \
        | grep -qF "IP Address:${lan_ip}"; then
    echo "  PASS: server cert has SAN IP:${lan_ip}"
    ((passed++))
else
    echo "  FAIL: server cert missing SAN IP:${lan_ip}" >&2
    ((failed++))
fi

# CA cert is a valid PEM x509 issued by Caddy's local CA.
if openssl x509 -in "$CA_CERT_HOST" -noout >/dev/null 2>&1; then
    echo "  PASS: docker/tls/ca.crt is a valid PEM x509"
    ((passed++))
else
    echo "  FAIL: docker/tls/ca.crt is not parseable as PEM x509" >&2
    ((failed++))
fi

subject="$(openssl x509 -in "$CA_CERT_HOST" -noout -subject 2>/dev/null || true)"
assert_output_contains "$subject" "Caddy" "CA cert subject mentions Caddy"

# caddy_data volume exists.
if docker volume ls --format '{{.Name}}' | grep -qE '(^|_)caddy_data$'; then
    echo "  PASS: caddy_data volume exists"
    ((passed++))
else
    echo "  FAIL: caddy_data volume not found" >&2
    ((failed++))
fi

# .env must NOT have CADDY_IMAGE in local mode (would force the LE custom image).
if grep -q '^CADDY_IMAGE=' "$COMPOSE_ENV" 2>/dev/null; then
    echo "  FAIL: docker/.env has CADDY_IMAGE set in local mode" >&2
    ((failed++))
else
    echo "  PASS: docker/.env has no CADDY_IMAGE in local mode (uses stock caddy:2.10-alpine)"
    ((passed++))
fi
