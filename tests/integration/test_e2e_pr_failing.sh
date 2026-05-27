#!/usr/bin/env bash
# Run each regression fixture against the clean baseline; expect non-zero exit.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")"/../.. && pwd)"

for FIXTURE in regression-coverage regression-lint regression-new-file security-critical; do
  SANDBOX="$(mktemp -d)"
  trap 'rm -rf "$SANDBOX"' RETURN

  mkdir -p "$SANDBOX/qg"
  cp -r "$REPO_ROOT/stub_adapter/fixtures/$FIXTURE/." "$SANDBOX/qg/"
  cp "$REPO_ROOT/tests/integration/fixtures/baseline_matching_clean.json" "$SANDBOX/qg/baseline.json"
  cp "$REPO_ROOT/templates/quality-gate.config.json" "$SANDBOX/config.json"

  export QG_OUTPUT_DIR="$SANDBOX/qg"
  export QG_CONFIG="$SANDBOX/config.json"

  "$REPO_ROOT/qg_core/scripts/compare-and-report.sh"
  if "$REPO_ROOT/qg_core/scripts/exit-code.sh"; then
    echo "FAIL: $FIXTURE should not have passed the gate" >&2
    cat "$SANDBOX/qg/comparator-report.json" >&2
    exit 1
  fi
  echo "OK: $FIXTURE correctly failed"
  rm -rf "$SANDBOX"
done

echo "PASS"
