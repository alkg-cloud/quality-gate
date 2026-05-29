#!/usr/bin/env bash
# Hermetic, offline test for install.sh: builds a fake source tarball with a
# prebuilt dist/, installs it via QG_ARCHIVE_URL=file://, and asserts the shim,
# PATH export, caching, and shim execution all behave.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")"/../.. && pwd)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

# Build a fake "GitHub archive": everything nested under one top-level dir so the
# installer's `tar --strip-components=1` is exercised. Ship a prebuilt dist/cli.js
# so the build step is skipped (no npm/network needed).
SRC="$SANDBOX/src/quality-gate-fake"
mkdir -p "$SRC/dist"
cat > "$SRC/package.json" <<'JSON'
{ "name": "@quality-gate/core", "version": "0.0.0-test", "bin": { "qg-core": "dist/cli.js" } }
JSON
cat > "$SRC/dist/cli.js" <<'JS'
console.log("QG_STUB_OK " + process.argv.slice(2).join(" "));
JS
TARBALL="$SANDBOX/archive.tar.gz"
tar -czf "$TARBALL" -C "$SANDBOX/src" quality-gate-fake

export QG_HOME="$SANDBOX/home"
export QG_REF="test-ref"
export QG_ARCHIVE_URL="file://$TARBALL"
export GITHUB_PATH="$SANDBOX/github_path"
: > "$GITHUB_PATH"

# --- First install -----------------------------------------------------------
bash "$REPO_ROOT/install.sh"

SHIM="$QG_HOME/bin/qg-core"
[ -x "$SHIM" ] || { echo "FAIL: shim not created/executable at $SHIM"; exit 1; }

OUT="$("$SHIM" pr --foo bar)"
[ "$OUT" = "QG_STUB_OK pr --foo bar" ] || { echo "FAIL: shim ran wrong target: '$OUT'"; exit 1; }

grep -qxF "$QG_HOME/bin" "$GITHUB_PATH" || { echo "FAIL: bin dir not appended to \$GITHUB_PATH"; exit 1; }

# Build was skipped (prebuilt dist present) → no node_modules installed.
[ ! -d "$QG_HOME/versions/test-ref/node_modules" ] || { echo "FAIL: build ran despite prebuilt dist"; exit 1; }

# --- Second install is a cached no-op (and must not duplicate the PATH entry) -
bash "$REPO_ROOT/install.sh"
count="$(grep -cxF "$QG_HOME/bin" "$GITHUB_PATH")"
[ "$count" = "1" ] || { echo "FAIL: \$GITHUB_PATH entry duplicated ($count times)"; exit 1; }

echo "PASS"
