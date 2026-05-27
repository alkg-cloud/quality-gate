#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")"/../.. && pwd)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

mkdir -p "$SANDBOX/qg"
cp -r "$REPO_ROOT/stub_adapter/fixtures/clean/." "$SANDBOX/qg/"
cp "$REPO_ROOT/tests/integration/fixtures/baseline_matching_clean.json" "$SANDBOX/qg/baseline.json"
cp "$REPO_ROOT/templates/quality-gate.config.json" "$SANDBOX/config.json"

export QG_OUTPUT_DIR="$SANDBOX/qg"
export QG_CONFIG="$SANDBOX/config.json"

"$REPO_ROOT/qg_core/scripts/compare-and-report.sh"
"$REPO_ROOT/qg_core/scripts/exit-code.sh"   # should exit 0

REPORT="$SANDBOX/qg/comparator-report.json"
[ "$(jq -r .gate_passed "$REPORT")" = "true" ] || { echo "FAIL: gate should pass"; exit 1; }
[ "$(jq -r .bootstrap   "$REPORT")" = "false" ] || { echo "FAIL: should not be bootstrap"; exit 1; }
echo "PASS"
