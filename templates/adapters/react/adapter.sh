#!/usr/bin/env bash
# Quality Gate adapter for React/Node projects.
# Tools: jest (coverage), eslint (lint), jscpd (duplication), npm audit (security).
# Reads $QG_OUTPUT_DIR, $QG_CONFIG. Writes 6 canonical JSON files into $QG_OUTPUT_DIR.

set -euo pipefail
: "${QG_OUTPUT_DIR:?must be set}"
: "${QG_CONFIG:?must be set}"

mkdir -p "$QG_OUTPUT_DIR"
MAX_FILE_LINES=$(jq -r '.thresholds.MAX_FILE_LINES' "$QG_CONFIG")
ROOT="$PWD"

# 1. Coverage — jest with coverage-summary reporter
npx --yes jest --coverage --coverageReporters=json-summary --silent > /dev/null 2>&1 || true
if [ -f coverage/coverage-summary.json ]; then
  jq --arg root "$ROOT/" '{
    lines_pct: (.total.lines.pct // 0),
    files: [
      to_entries[] | select(.key != "total")
      | { path: (.key | sub("^" + ($root | @text); "")), lines_pct: (.value.lines.pct // 0) }
    ] | sort_by(.path)
  }' coverage/coverage-summary.json > "$QG_OUTPUT_DIR/coverage.json"
else
  echo '{"_skipped":"jest produced no coverage-summary.json"}' > "$QG_OUTPUT_DIR/coverage.json"
fi

# 2. Lint — eslint with json formatter (exit code 1 means violations, 2 means crash; both are non-fatal here)
npx --yes eslint . --ext .js,.jsx,.ts,.tsx --format=json --output-file .eslint-report.json 2>/dev/null || true
if [ -f .eslint-report.json ]; then
  jq --arg root "$ROOT/" '{
    total: ([.[] | (.errorCount + .warningCount)] | add // 0),
    by_file: [
      .[] | select((.errorCount + .warningCount) > 0)
      | { path: (.filePath | sub("^" + ($root | @text); "")), count: (.errorCount + .warningCount) }
    ] | sort_by(.path)
  }' .eslint-report.json > "$QG_OUTPUT_DIR/lint.json"
else
  echo '{"_skipped":"eslint failed to produce a report"}' > "$QG_OUTPUT_DIR/lint.json"
fi

# 3. Duplication — jscpd
mkdir -p .jscpd
npx --yes jscpd . --reporters json --output .jscpd \
  --ignore "**/node_modules/**,**/dist/**,**/coverage/**,**/.jscpd/**" --silent 2>/dev/null || true
if [ -f .jscpd/jscpd-report.json ]; then
  jq '{ pct: (.statistics.total.percentage // 0), clones: (.statistics.total.clones // 0) }' \
    .jscpd/jscpd-report.json > "$QG_OUTPUT_DIR/duplication.json"
else
  echo '{"_skipped":"jscpd failed"}' > "$QG_OUTPUT_DIR/duplication.json"
fi

# 4. File size — walk source tree, count lines
( find . -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "*.mjs" -o -name "*.cjs" \) \
    -not -path "./node_modules/*" -not -path "./dist/*" -not -path "./coverage/*" \
    -not -path "./.jscpd/*" -not -path "./.git/*"
) | while read -r f; do
    lines=$(wc -l < "$f")
    if [ "$lines" -ge "$MAX_FILE_LINES" ]; then
      printf '{"path":"%s","lines":%d}\n' "${f#./}" "$lines"
    fi
  done | jq -s --argjson max "$MAX_FILE_LINES" \
    '{ max_lines: $max, violations: (sort_by(.path)) }' > "$QG_OUTPUT_DIR/file_size.json"

# 5. Security — npm audit
npm audit --json > .npm-audit.json 2>/dev/null || true
if [ -f .npm-audit.json ] && jq -e '.metadata.vulnerabilities' .npm-audit.json > /dev/null 2>&1; then
  jq '.metadata.vulnerabilities
       | { critical: (.critical // 0), high: (.high // 0), moderate: (.moderate // 0), low: (.low // 0) }' \
       .npm-audit.json > "$QG_OUTPUT_DIR/security.json"
else
  echo '{"_skipped":"npm audit failed or produced no metadata"}' > "$QG_OUTPUT_DIR/security.json"
fi

# 6. _meta
cat > "$QG_OUTPUT_DIR/_meta.json" <<'JSON'
{
  "adapter": "react",
  "adapter_version": "0.1.0",
  "tools": ["jest", "eslint", "jscpd", "npm-audit"]
}
JSON
