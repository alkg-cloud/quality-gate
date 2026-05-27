#!/usr/bin/env bash
# Fetch baseline.json from the quality-metrics orphan branch.
# If the branch does not exist, writes "NONE" sentinel so downstream
# tools know we are in bootstrap mode.
set -euo pipefail

BRANCH="${QG_ORPHAN_BRANCH:-quality-metrics}"
OUTPUT="${1:?usage: $0 <output_path>}"

if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git fetch origin "$BRANCH":refs/remotes/origin/"$BRANCH"
  git show "origin/$BRANCH:baseline.json" > "$OUTPUT"
  echo "fetched baseline from $BRANCH" >&2
else
  echo "NONE" > "$OUTPUT"
  echo "orphan branch $BRANCH not found — bootstrap mode" >&2
fi
