#!/usr/bin/env bash
# Simulates: fresh repo, no orphan branch, adapter outputs clean metrics.
# Expects: comparator-report.json is bootstrap=true, gate_passed=true.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")"/../.. && pwd)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

mkdir -p "$SANDBOX/qg"
# Copy clean fixtures into output dir
cp -r "$REPO_ROOT/stub_adapter/fixtures/clean/." "$SANDBOX/qg/"
echo "NONE" > "$SANDBOX/qg/baseline.json"
cp "$REPO_ROOT/templates/quality-gate.config.json" "$SANDBOX/config.json"

export QG_OUTPUT_DIR="$SANDBOX/qg"
export QG_CONFIG="$SANDBOX/config.json"

"$REPO_ROOT/qg_core/scripts/compare-and-report.sh"

REPORT="$SANDBOX/qg/comparator-report.json"
if [ "$(jq -r .bootstrap "$REPORT")" != "true" ]; then
  echo "FAIL: expected bootstrap=true" >&2; exit 1
fi
if [ "$(jq -r .gate_passed "$REPORT")" != "true" ]; then
  echo "FAIL: expected gate_passed=true" >&2; exit 1
fi
echo "PASS"
