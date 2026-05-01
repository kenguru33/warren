#!/usr/bin/env bash
# Playwright E2E suite — runs against the running stack on http://localhost:3000.
# Assumes infrastructure is already up via `warren start --dev` or compose.
# Set WARREN_BASE_URL to override the target.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TESTS_DIR/../.." && pwd)"
UI_DIR="$REPO_ROOT/nextjs-ui"

source "$TESTS_DIR/lib/assert.sh"

echo ""
echo "── Test: e2e (Playwright) ────────────────────────────────────"

if ! command -v npx &>/dev/null; then
    echo "  SKIP: npx not on PATH"
    exit 0
fi

if [[ ! -d "$UI_DIR/node_modules" ]]; then
    echo "  Installing UI dependencies…"
    (cd "$UI_DIR" && npm install --silent)
fi

# Make sure browsers are present (first-time runs need them).
(cd "$UI_DIR" && npx playwright install chromium --with-deps 2>/dev/null || \
                 npx playwright install chromium 2>/dev/null || true)

# Default base URL — caller can override.
export WARREN_BASE_URL="${WARREN_BASE_URL:-http://localhost:3000}"

if (cd "$UI_DIR" && npx playwright test --reporter=list); then
    pass "Playwright suite green against $WARREN_BASE_URL"
else
    fail "Playwright suite failed against $WARREN_BASE_URL"
fi
