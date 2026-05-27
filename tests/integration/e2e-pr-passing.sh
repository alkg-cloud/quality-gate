#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")"/../.. && pwd)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

mkdir -p "$SANDBOX/qg" "$SANDBOX/repo"
cp -r "$REPO_ROOT/stub_adapter/fixtures/clean/." "$SANDBOX/qg/"
cp "$REPO_ROOT/templates/quality-gate.config.json" "$SANDBOX/config.json"

# Set up a fake remote with quality-metrics branch holding the matching baseline
git init --bare "$SANDBOX/remote.git" >/dev/null
git -C "$SANDBOX/repo" init -b main >/dev/null
git -C "$SANDBOX/repo" -c user.email=t@t -c user.name=t commit --allow-empty -m initial >/dev/null
git -C "$SANDBOX/repo" remote add origin "$SANDBOX/remote.git"
git -C "$SANDBOX/repo" push origin main >/dev/null

# Create the orphan branch with the baseline
WORK="$SANDBOX/work-orphan"
git -C "$SANDBOX/repo" worktree add --orphan -B quality-metrics "$WORK" >/dev/null
cp "$REPO_ROOT/tests/integration/fixtures/baseline_matching_clean.json" "$WORK/baseline.json"
git -C "$WORK" -c user.email=t@t -c user.name=t add baseline.json
git -C "$WORK" -c user.email=t@t -c user.name=t commit -m "bootstrap" >/dev/null
git -C "$SANDBOX/repo" push origin quality-metrics >/dev/null

node "$REPO_ROOT/dist/cli.js" pr \
  --config "$SANDBOX/config.json" \
  --output-dir "$SANDBOX/qg" \
  --repo-path "$SANDBOX/repo"

REPORT="$SANDBOX/qg/comparator-report.json"
[ "$(jq -r .gate_passed "$REPORT")" = "true" ] || { echo "FAIL: gate should pass"; exit 1; }
[ "$(jq -r .bootstrap "$REPORT")" = "false" ] || { echo "FAIL: should not be bootstrap"; exit 1; }
echo "PASS"
