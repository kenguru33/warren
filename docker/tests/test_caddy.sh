#!/usr/bin/env bash
# Runtime tests for the Caddy edge proxy.
# Requires the stack to be running ('warren start' between test_setup and this).

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TESTS_DIR/../.." && pwd)"
DOCKER_DIR="$REPO_ROOT/docker"

source "$TESTS_DIR/lib/assert.sh"

echo "--- test_caddy ---"

CA_CERT="$DOCKER_DIR/tls/ca.crt"

# Skip if caddy isn't running (e.g. tests ran without warren start).
if ! docker ps --format '{{.Names}}' | grep -q '^caddy$'; then
    echo "  SKIP: caddy container not running"
    return 0 2>/dev/null || exit 0
fi

# /ca.crt is reachable plaintext on :80 (chicken-and-egg path).
status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost/ca.crt 2>/dev/null || echo 000)"
assert_eq "$status" "200" "GET http://localhost/ca.crt returns 200"

ctype="$(curl -s -I http://localhost/ca.crt 2>/dev/null | awk -F': ' 'tolower($1)=="content-type" {print $2}' | tr -d '\r\n')"
assert_output_contains "$ctype" "x-x509-ca-cert" "/ca.crt has x509-ca-cert content type"

# Browser HTTP path 308-redirects to HTTPS.
status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost/ 2>/dev/null || echo 000)"
if [[ "$status" =~ ^30[178]$ ]]; then
    echo "  PASS: GET http://localhost/ redirects to HTTPS (status $status)"
    ((passed++))
else
    echo "  FAIL: GET http://localhost/ expected 30x redirect, got $status" >&2
    ((failed++))
fi

# /api/auth/login is NOT in the device passthrough — must redirect to HTTPS.
status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost/api/auth/login 2>/dev/null || echo 000)"
if [[ "$status" =~ ^30[178]$ ]]; then
    echo "  PASS: /api/auth/login is redirected (status $status)"
    ((passed++))
else
    echo "  FAIL: /api/auth/login expected 30x redirect, got $status" >&2
    ((failed++))
fi

# Device endpoints now redirect to HTTPS too — firmware speaks TLS.
for path in /api/sensors/announce /api/sensors/config/test-device /api/sensors/test-device/reading; do
    status="$(curl -s -o /dev/null -w '%{http_code}' \
        -X POST -H 'Content-Type: application/json' -d '{}' \
        "http://localhost${path}" 2>/dev/null || echo 000)"
    if [[ "$status" =~ ^30[178]$ ]]; then
        echo "  PASS: device endpoint $path redirected to HTTPS (status $status)"
        ((passed++))
    else
        echo "  FAIL: device endpoint $path expected 30x redirect, got $status" >&2
        ((failed++))
    fi
done

# HTTPS handshake validates against the local CA. Use the LAN IP from
# docker/.env as the URL (no hostname involved in local-CA mode).
lan_ip="$(grep -m1 '^WARREN_LAN_IP=' "$DOCKER_DIR/.env" 2>/dev/null | cut -d= -f2-)"
if [[ -f "$CA_CERT" && -n "$lan_ip" ]]; then
    status="$(curl -s -o /dev/null -w '%{http_code}' \
        --cacert "$CA_CERT" \
        "https://${lan_ip}/login" 2>/dev/null || echo 000)"
    if [[ "$status" =~ ^[23] ]]; then
        echo "  PASS: HTTPS to ${lan_ip}/login validates against docker/tls/ca.crt (status $status)"
        ((passed++))
    else
        echo "  FAIL: HTTPS validation against ca.crt failed (status $status)" >&2
        ((failed++))
    fi
fi
