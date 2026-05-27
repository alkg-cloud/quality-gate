#!/usr/bin/env bash
# Orchestrate collect → compare → render PR comment → render badges.
# Assumes adapter has already produced JSONs in $QG_OUTPUT_DIR.
set -euo pipefail

: "${QG_OUTPUT_DIR:?QG_OUTPUT_DIR must be set}"
: "${QG_CONFIG:?QG_CONFIG must be set}"

BASELINE_FILE="$QG_OUTPUT_DIR/baseline.json"
METRICS_FILE="$QG_OUTPUT_DIR/metrics.json"
REPORT_FILE="$QG_OUTPUT_DIR/comparator-report.json"
COMMENT_FILE="$QG_OUTPUT_DIR/pr-comment.md"
BADGES_DIR="$QG_OUTPUT_DIR/badges"

# 1. baseline (fetch script wrote either valid JSON or "NONE\n")
if [ "$(head -c 4 "$BASELINE_FILE")" = "NONE" ]; then
  BASELINE_ARG="NONE"
else
  BASELINE_ARG="$BASELINE_FILE"
fi

# 2. collect
python3 -m qg_core.cli collect --input "$QG_OUTPUT_DIR" --output "$METRICS_FILE"

# 3. compare
python3 -m qg_core.cli compare --metrics "$METRICS_FILE" --baseline "$BASELINE_ARG" --config "$QG_CONFIG" --output "$REPORT_FILE"

# 4. render PR comment
python3 -m qg_core.cli report --metrics "$METRICS_FILE" --baseline "$BASELINE_ARG" --report "$REPORT_FILE" --output "$COMMENT_FILE"

# 5. render badges
python3 -m qg_core.cli render-badges --metrics "$METRICS_FILE" --output-dir "$BADGES_DIR"

# 6. write job summary
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  cat "$COMMENT_FILE" >> "$GITHUB_STEP_SUMMARY"
fi

echo "compare-and-report done. Report at $REPORT_FILE"
