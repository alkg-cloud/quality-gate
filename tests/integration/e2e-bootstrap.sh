#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")"/../.. && pwd)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

mkdir -p "$SANDBOX/qg"
cp -r "$REPO_ROOT/stub_adapter/fixtures/clean/." "$SANDBOX/qg/"
cp "$REPO_ROOT/templates/quality-gate.config.json" "$SANDBOX/config.json"

# Initialize a throwaway git repo (so simple-git in pr command has SOMETHING to query)
mkdir -p "$SANDBOX/repo"
git -C "$SANDBOX/repo" init -b main >/dev/null
git -C "$SANDBOX/repo" -c user.email=t@t -c user.name=t commit --allow-empty -m initial >/dev/null

node "$REPO_ROOT/dist/cli.js" pr \
  --config "$SANDBOX/config.json" \
  --output-dir "$SANDBOX/qg" \
  --repo-path "$SANDBOX/repo" || true   # bootstrap → pr exits 0 anyway

REPORT="$SANDBOX/qg/comparator-report.json"
[ "$(jq -r .bootstrap "$REPORT")" = "true" ] || { echo "FAIL: expected bootstrap=true"; exit 1; }
[ "$(jq -r .gate_passed "$REPORT")" = "true" ] || { echo "FAIL: expected gate_passed=true"; exit 1; }
echo "PASS"
