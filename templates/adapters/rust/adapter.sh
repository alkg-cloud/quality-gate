#!/usr/bin/env bash
# Quality Gate adapter for Rust projects.
# Tools: cargo-tarpaulin (coverage), cargo-clippy (lint), cargo-audit (security).
# Duplication is intentionally skipped — no widely-adopted Rust duplication tool with stable JSON output.

set -euo pipefail
: "${QG_OUTPUT_DIR:?must be set}"
: "${QG_CONFIG:?must be set}"

mkdir -p "$QG_OUTPUT_DIR"
MAX_FILE_LINES=$(jq -r '.thresholds.MAX_FILE_LINES' "$QG_CONFIG")
ROOT="$PWD"

# 1. Coverage — cargo-tarpaulin with JSON output
mkdir -p .tarpaulin
cargo tarpaulin --out Json --output-dir .tarpaulin --skip-clean 2>/dev/null || true
TARP_REPORT=$(ls -t .tarpaulin/tarpaulin-report*.json 2>/dev/null | head -1 || true)
if [ -n "$TARP_REPORT" ] && [ -f "$TARP_REPORT" ]; then
  # Tarpaulin JSON shape: { files: [{ path: [...], traces: [...], covered: N, coverable: N }, ...], coverage: <pct> }
  jq --arg root "$ROOT/" '{
    lines_pct: (.coverage // 0),
    files: [
      .files[]? | (.path | join("/")) as $p |
      { path: ($p | sub("^"+($root|@text); "")),
        lines_pct: (if (.coverable // 0) > 0 then (.covered * 100.0 / .coverable) else 0 end) }
    ] | sort_by(.path)
  }' "$TARP_REPORT" > "$QG_OUTPUT_DIR/coverage.json"
else
  echo '{"_skipped":"cargo-tarpaulin produced no JSON report"}' > "$QG_OUTPUT_DIR/coverage.json"
fi

# 2. Lint — cargo-clippy with JSON output
cargo clippy --message-format=json -- -D warnings 2>/dev/null > .clippy.jsonl || true
if [ -s .clippy.jsonl ]; then
  # Each line is a JSON message; we count "compiler-message" entries with level error or warning, grouped by file.
  jq -s --arg root "$ROOT/" '
    map(select(.reason == "compiler-message"
               and .message.level == "warning"
               or .message.level == "error"))
    | map({
        path: ((.message.spans // [])[0].file_name // "" | sub("^"+($root|@text); "")),
        level: .message.level
      })
    | map(select(.path != ""))
    | group_by(.path)
    | { total: length, by_file: map({ path: (.[0].path), count: length }) | sort_by(.path) }
    | .total |= ([.by_file[].count] | add // 0)
  ' .clippy.jsonl > "$QG_OUTPUT_DIR/lint.json"
else
  echo '{"_skipped":"clippy produced no JSON output"}' > "$QG_OUTPUT_DIR/lint.json"
fi

# 3. Duplication — explicitly skipped
echo '{"_skipped":"no first-class duplication tool for Rust"}' > "$QG_OUTPUT_DIR/duplication.json"

# 4. File size — walk src/ for .rs files
( find . -type f -name "*.rs" \
    -not -path "./target/*" -not -path "./.tarpaulin/*" -not -path "./.git/*"
) | while read -r f; do
    lines=$(wc -l < "$f")
    if [ "$lines" -ge "$MAX_FILE_LINES" ]; then
      printf '{"path":"%s","lines":%d}\n' "${f#./}" "$lines"
    fi
  done | jq -s --argjson max "$MAX_FILE_LINES" \
    '{ max_lines: $max, violations: (sort_by(.path)) }' > "$QG_OUTPUT_DIR/file_size.json"

# 5. Security — cargo-audit (requires `cargo install cargo-audit` once)
cargo audit --json > .cargo-audit.json 2>/dev/null || true
if [ -f .cargo-audit.json ] && jq -e '.vulnerabilities.list' .cargo-audit.json > /dev/null 2>&1; then
  jq '{
    critical: ([.vulnerabilities.list[]? | select(.advisory.severity == "critical")] | length),
    high:     ([.vulnerabilities.list[]? | select(.advisory.severity == "high")]     | length),
    moderate: ([.vulnerabilities.list[]? | select(.advisory.severity == "medium")]   | length),
    low:      ([.vulnerabilities.list[]? | select(.advisory.severity == "low")]      | length)
  }' .cargo-audit.json > "$QG_OUTPUT_DIR/security.json"
else
  echo '{"_skipped":"cargo-audit failed or produced no advisories"}' > "$QG_OUTPUT_DIR/security.json"
fi

# 6. _meta
cat > "$QG_OUTPUT_DIR/_meta.json" <<'JSON'
{
  "adapter": "rust",
  "adapter_version": "0.1.0",
  "tools": ["cargo-tarpaulin", "cargo-clippy", "cargo-audit"]
}
JSON
