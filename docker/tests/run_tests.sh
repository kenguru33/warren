#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$TESTS_DIR/lib/assert.sh"

passed=0
failed=0

run_test_file() {
    local f="$1"
    echo ""
    source "$f"
}

for f in "$TESTS_DIR"/test_*.sh; do
    run_test_file "$f"
done

echo ""
echo "────────────────────────────────"
echo "Results: $passed passed, $failed failed"
echo "────────────────────────────────"
[[ $failed -eq 0 ]]
