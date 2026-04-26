#!/usr/bin/env bash
# Minimal assertion helpers. Expects $passed and $failed to be declared in the caller.

assert_eq() {
    local actual="$1" expected="$2" label="${3:-assert_eq}"
    if [[ "$actual" == "$expected" ]]; then
        echo "  PASS: $label"
        ((passed++))
    else
        echo "  FAIL: $label — expected '$expected', got '$actual'" >&2
        ((failed++))
    fi
}

assert_file() {
    local path="$1" label="${2:-$1}"
    if [[ -f "$path" ]]; then
        echo "  PASS: file exists: $label"
        ((passed++))
    else
        echo "  FAIL: expected file: $label" >&2
        ((failed++))
    fi
}

assert_no_file() {
    local path="$1" label="${2:-$1}"
    if [[ ! -f "$path" ]]; then
        echo "  PASS: file absent: $label"
        ((passed++))
    else
        echo "  FAIL: expected no file: $label" >&2
        ((failed++))
    fi
}

assert_no_dir() {
    local path="$1" label="${2:-$1}"
    if [[ ! -d "$path" ]]; then
        echo "  PASS: dir absent: $label"
        ((passed++))
    else
        echo "  FAIL: expected no dir: $label" >&2
        ((failed++))
    fi
}

assert_cmd() {
    local label="$1"; shift
    if "$@" &>/dev/null; then
        echo "  PASS: $label"
        ((passed++))
    else
        echo "  FAIL: $label — command failed: $*" >&2
        ((failed++))
    fi
}

assert_cmd_fails() {
    local label="$1"; shift
    if ! "$@" &>/dev/null; then
        echo "  PASS: $label (expected failure)"
        ((passed++))
    else
        echo "  FAIL: $label — expected failure but command succeeded: $*" >&2
        ((failed++))
    fi
}

assert_output_contains() {
    local output="$1" pattern="$2" label="${3:-assert_output_contains}"
    if echo "$output" | grep -q "$pattern"; then
        echo "  PASS: $label"
        ((passed++))
    else
        echo "  FAIL: $label — pattern '$pattern' not found in output" >&2
        ((failed++))
    fi
}
