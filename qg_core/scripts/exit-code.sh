#!/usr/bin/env bash
# Read the comparator report and exit non-zero if the gate failed.
set -euo pipefail
: "${QG_OUTPUT_DIR:?QG_OUTPUT_DIR must be set}"
python3 -m qg_core.cli exit-code --report "$QG_OUTPUT_DIR/comparator-report.json"
