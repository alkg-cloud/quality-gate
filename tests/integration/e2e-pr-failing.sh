#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")"/../.. && pwd)"

setup_remote_with_clean_baseline() {
  local sandbox="$1"
  git init --bare "$sandbox/remote.git" >/dev/null
  git -C "$sandbox/repo" init -b main >/dev/null
  git -C "$sandbox/repo" -c user.email=t@t -c user.name=t commit --allow-empty -m initial >/dev/null
  git -C "$sandbox/repo" remote add origin "$sandbox/remote.git"
  git -C "$sandbox/repo" push origin main >/dev/null
  local work="$sandbox/work-orphan"
  git -C "$sandbox/repo" worktree add --orphan -B quality-metrics "$work" >/dev/null
  cp "$REPO_ROOT/tests/integration/fixtures/baseline_matching_clean.json" "$work/baseline.json"
  git -C "$work" -c user.email=t@t -c user.name=t add baseline.json
  git -C "$work" -c user.email=t@t -c user.name=t commit -m "bootstrap" >/dev/null
  git -C "$sandbox/repo" push origin quality-metrics >/dev/null
  git -C "$sandbox/repo" worktree remove --force "$work"
}

for FIXTURE in regression-coverage regression-lint regression-new-file security-critical; do
  SANDBOX="$(mktemp -d)"

  mkdir -p "$SANDBOX/qg" "$SANDBOX/repo"
  cp -r "$REPO_ROOT/stub_adapter/fixtures/$FIXTURE/." "$SANDBOX/qg/"
  cp "$REPO_ROOT/templates/quality-gate.config.json" "$SANDBOX/config.json"
  setup_remote_with_clean_baseline "$SANDBOX"

  if node "$REPO_ROOT/dist/cli.js" pr \
       --config "$SANDBOX/config.json" \
       --output-dir "$SANDBOX/qg" \
       --repo-path "$SANDBOX/repo"; then
    echo "FAIL: $FIXTURE should not have passed the gate" >&2
    cat "$SANDBOX/qg/comparator-report.json" >&2
    rm -rf "$SANDBOX"
    exit 1
  fi
  echo "OK: $FIXTURE correctly failed"
  rm -rf "$SANDBOX"
done
echo "PASS"
