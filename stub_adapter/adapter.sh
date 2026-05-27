#!/usr/bin/env bash
# Test-only adapter: copies fixture JSONs into $QG_OUTPUT_DIR.
# Select scenario with $QG_FIXTURE (default: clean).
set -euo pipefail
: "${QG_OUTPUT_DIR:?must be set}"
FIXTURE="${QG_FIXTURE:-clean}"
SRC="$(cd "$(dirname "$0")" && pwd)/fixtures/$FIXTURE"
[ -d "$SRC" ] || { echo "unknown fixture: $FIXTURE (looked in $SRC)"; exit 2; }
mkdir -p "$QG_OUTPUT_DIR"
cp "$SRC"/*.json "$QG_OUTPUT_DIR/"
