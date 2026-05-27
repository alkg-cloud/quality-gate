#!/usr/bin/env bash
# Quality Gate adapter for Ruby/Rails projects.
# Tools: rspec+simplecov (coverage), rubocop (lint), flay (duplication), bundler-audit (security).
# Reads $QG_OUTPUT_DIR, $QG_CONFIG. Writes 6 canonical JSON files into $QG_OUTPUT_DIR.

set -euo pipefail
: "${QG_OUTPUT_DIR:?must be set}"
: "${QG_CONFIG:?must be set}"

mkdir -p "$QG_OUTPUT_DIR"
MAX_FILE_LINES=$(jq -r '.thresholds.MAX_FILE_LINES' "$QG_CONFIG")
ROOT="$PWD"

# 1. Coverage — run rspec with simplecov, then parse coverage/.resultset.json
# Requires the project's spec_helper.rb to start SimpleCov.start (any group).
bundle exec rspec --format progress > /dev/null 2>&1 || true
if [ -f coverage/.resultset.json ]; then
  # .resultset.json shape: { "RSpec": { "coverage": { "<abs path>": { "lines": [null,1,0,...] } } } }
  # Compute global pct = covered_lines / coverable_lines across all files.
  jq --arg root "$ROOT/" '
    (.. | objects | select(has("coverage")) | .coverage) as $c
    | [ $c | to_entries[]
        | { path: (.key | sub("^"+($root|@text); "")),
            lines: .value.lines } ] as $files
    | ($files | map(.lines | map(select(. != null)) | length) | add) as $coverable
    | ($files | map(.lines | map(select(. != null and . > 0)) | length) | add) as $covered
    | {
        lines_pct: (if $coverable > 0 then ($covered * 100.0 / $coverable) else 0 end),
        files: [ $files[] |
          (.lines | map(select(. != null)) | length) as $cov |
          (.lines | map(select(. != null and . > 0)) | length) as $hit |
          { path: .path,
            lines_pct: (if $cov > 0 then ($hit * 100.0 / $cov) else 0 end) }
        ] | sort_by(.path)
      }
  ' coverage/.resultset.json > "$QG_OUTPUT_DIR/coverage.json"
else
  echo '{"_skipped":"rspec/simplecov produced no .resultset.json"}' > "$QG_OUTPUT_DIR/coverage.json"
fi

# 2. Lint — rubocop with json formatter
bundle exec rubocop --format json --out .rubocop-report.json . 2>/dev/null || true
if [ -f .rubocop-report.json ]; then
  jq --arg root "$ROOT/" '{
    total: ([.files[]? | .offenses | length] | add // 0),
    by_file: [
      .files[]? | select((.offenses | length) > 0)
      | { path: (.path | sub("^"+($root|@text); "")), count: (.offenses | length) }
    ] | sort_by(.path)
  }' .rubocop-report.json > "$QG_OUTPUT_DIR/lint.json"
else
  echo '{"_skipped":"rubocop failed"}' > "$QG_OUTPUT_DIR/lint.json"
fi

# 3. Duplication — flay; convert flay mass-score to a pseudo-percentage relative to total lines
# flay reports a "total score" — higher means more duplication. We normalize against (total source lines / 100).
if command -v flay >/dev/null 2>&1 || bundle exec flay --help >/dev/null 2>&1; then
  bundle exec flay --summary $(find app lib -type d 2>/dev/null | head -10) > .flay.txt 2>/dev/null || true
  if [ -f .flay.txt ]; then
    flay_score=$(grep -E "^Total score" .flay.txt 2>/dev/null | awk '{print $3}' || echo 0)
    total_lines=$(find app lib -name "*.rb" -type f 2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}' || echo 1)
    pct=$(awk -v s="$flay_score" -v l="$total_lines" 'BEGIN { printf "%.2f", (l > 0 ? (s * 100.0 / l) : 0) }')
    printf '{"pct": %s, "clones": null}\n' "$pct" > "$QG_OUTPUT_DIR/duplication.json"
  else
    echo '{"_skipped":"flay produced no output"}' > "$QG_OUTPUT_DIR/duplication.json"
  fi
else
  echo '{"_skipped":"flay not installed"}' > "$QG_OUTPUT_DIR/duplication.json"
fi

# 4. File size — walk app/, lib/, spec/
( find app lib spec -name "*.rb" -type f 2>/dev/null
) | while read -r f; do
    lines=$(wc -l < "$f")
    if [ "$lines" -ge "$MAX_FILE_LINES" ]; then
      printf '{"path":"%s","lines":%d}\n' "$f" "$lines"
    fi
  done | jq -s --argjson max "$MAX_FILE_LINES" \
    '{ max_lines: $max, violations: (sort_by(.path)) }' > "$QG_OUTPUT_DIR/file_size.json"

# 5. Security — bundler-audit
bundle exec bundler-audit check --format json > .bundler-audit.json 2>/dev/null || true
if [ -f .bundler-audit.json ] && [ -s .bundler-audit.json ]; then
  jq '{
    critical: ([.[]? | select(.advisory.criticality == "critical")] | length),
    high:     ([.[]? | select(.advisory.criticality == "high")]     | length),
    moderate: ([.[]? | select(.advisory.criticality == "medium")]   | length),
    low:      ([.[]? | select(.advisory.criticality == "low")]      | length)
  }' .bundler-audit.json > "$QG_OUTPUT_DIR/security.json"
else
  echo '{"_skipped":"bundler-audit failed or no advisories"}' > "$QG_OUTPUT_DIR/security.json"
fi

# 6. _meta
cat > "$QG_OUTPUT_DIR/_meta.json" <<'JSON'
{
  "adapter": "rails",
  "adapter_version": "0.1.0",
  "tools": ["rspec", "simplecov", "rubocop", "flay", "bundler-audit"]
}
JSON
