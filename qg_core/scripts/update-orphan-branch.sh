#!/usr/bin/env bash
# Update the quality-metrics orphan branch with a new baseline + badges + history.
# Idempotent: only commits if baseline content actually changed.
set -euo pipefail

: "${QG_OUTPUT_DIR:?QG_OUTPUT_DIR must be set}"
: "${QG_CONFIG:?QG_CONFIG must be set}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN must be set}"

BRANCH="${QG_ORPHAN_BRANCH:-quality-metrics}"
METRICS_FILE="$QG_OUTPUT_DIR/metrics.json"
COMMIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
SHORT_SHA="${COMMIT_SHA:0:7}"
REF="${GITHUB_REF:-refs/heads/main}"

# Build new baseline payload
NEW_BASELINE="$QG_OUTPUT_DIR/new-baseline.json"
python3 -m qg_core.cli baseline-payload \
  --metrics "$METRICS_FILE" --config "$QG_CONFIG" \
  --commit-sha "$COMMIT_SHA" --ref "$REF" --output "$NEW_BASELINE"

# Set up worktree on orphan branch
WORKTREE_DIR="$(mktemp -d)"
trap 'rm -rf "$WORKTREE_DIR"' EXIT

if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git fetch origin "$BRANCH":refs/remotes/origin/"$BRANCH"
  git worktree add -B "$BRANCH" "$WORKTREE_DIR" "origin/$BRANCH"
  COVERAGE_BEFORE=$(jq -r '.metrics.coverage.lines_pct' "$WORKTREE_DIR/baseline.json")
else
  git worktree add --orphan -B "$BRANCH" "$WORKTREE_DIR"
  ( cd "$WORKTREE_DIR" && git rm -rf . 2>/dev/null || true )
  COVERAGE_BEFORE="NONE"
fi

cp "$NEW_BASELINE" "$WORKTREE_DIR/baseline.json"
mkdir -p "$WORKTREE_DIR/badges" "$WORKTREE_DIR/history"
cp "$QG_OUTPUT_DIR/badges/"*.json "$WORKTREE_DIR/badges/"
DATE_PREFIX="$(date -u +%Y-%m-%d)"
cp "$NEW_BASELINE" "$WORKTREE_DIR/history/${DATE_PREFIX}-${SHORT_SHA}.json"

# Ensure README exists
if [ ! -f "$WORKTREE_DIR/README.md" ]; then
  cat > "$WORKTREE_DIR/README.md" <<'EOF'
# quality-metrics

Auto-managed by the Quality Gate workflow. **Do not edit by hand.**

- `baseline.json` — current frozen baseline (source of ratchet truth)
- `badges/*.json` — shields.io endpoints
- `history/*.json` — snapshot per merge to default branch

To reset, delete the branch — the next merge to default branch will re-bootstrap.
EOF
fi

# Check for actual change in baseline before committing
NEW_HASH=$(jq -S 'del(.updated_at)' "$NEW_BASELINE" | sha256sum | cut -d' ' -f1)
OLD_HASH="none"
if [ -f "$WORKTREE_DIR/.last-baseline-hash" ]; then
  OLD_HASH=$(cat "$WORKTREE_DIR/.last-baseline-hash")
fi

cd "$WORKTREE_DIR"
git add baseline.json badges history README.md

if [ "$NEW_HASH" = "$OLD_HASH" ]; then
  # Baseline content unchanged; still rewrite badges if changed (already added).
  if git diff --cached --quiet; then
    echo "no changes to commit"
    git worktree remove --force "$WORKTREE_DIR"
    exit 0
  fi
fi
echo "$NEW_HASH" > .last-baseline-hash
git add .last-baseline-hash

COVERAGE_AFTER=$(jq -r '.metrics.coverage.lines_pct' baseline.json)
COMMIT_MSG=$(python3 -m qg_core.cli commit-message \
  --short-sha "$SHORT_SHA" --before "$COVERAGE_BEFORE" --after "$COVERAGE_AFTER")

git -c user.email="quality-gate-bot@users.noreply.github.com" \
    -c user.name="quality-gate-bot" \
    commit -m "$COMMIT_MSG"
git push "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "$BRANCH":"$BRANCH"
echo "pushed to $BRANCH"
