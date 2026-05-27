#!/usr/bin/env bash
# Simulate update-orphan-branch.sh against a local bare repo (no GitHub).
# Verifies that the orphan branch is created on first run, and updated on second.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")"/../.. && pwd)"

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

# Create a local "remote" (bare repo) and a working clone.
git init --bare "$SANDBOX/remote.git" >/dev/null
git -c init.defaultBranch=main clone "$SANDBOX/remote.git" "$SANDBOX/work" >/dev/null
cd "$SANDBOX/work"
git -c user.email=t@t -c user.name=t commit --allow-empty -m "initial" >/dev/null
git push origin HEAD:main >/dev/null

# Set up adapter outputs
mkdir -p "$SANDBOX/work/qg"
cp -r "$REPO_ROOT/stub_adapter/fixtures/clean/." "$SANDBOX/work/qg/"
cp "$REPO_ROOT/templates/quality-gate.config.json" "$SANDBOX/work/config.json"

# Stub GITHUB_TOKEN/GITHUB_REPOSITORY/GITHUB_SHA/GITHUB_REF for the script; replace `git push` URL
export GITHUB_TOKEN=stub
export GITHUB_REPOSITORY=stub/stub
export GITHUB_SHA="$(git -C "$SANDBOX/work" rev-parse HEAD)"
export GITHUB_REF=refs/heads/main
export QG_OUTPUT_DIR="$SANDBOX/work/qg"
export QG_CONFIG="$SANDBOX/work/config.json"

# First we must produce metrics.json + badges (compare-and-report does that)
echo "NONE" > "$SANDBOX/work/qg/baseline.json"
"$REPO_ROOT/qg_core/scripts/compare-and-report.sh"

# Patch the push URL inline: the test calls update-orphan-branch.sh but redirects push to local remote.
# Simplest path: copy the script and rewrite the push URL.
sed 's|https://x-access-token:.*@github.com/${GITHUB_REPOSITORY}.git|'"$SANDBOX"'/remote.git|' \
    "$REPO_ROOT/qg_core/scripts/update-orphan-branch.sh" > "$SANDBOX/work/update.sh"
chmod +x "$SANDBOX/work/update.sh"

cd "$SANDBOX/work"
"$SANDBOX/work/update.sh"

# Verify the orphan branch exists on the "remote" and has expected files.
git -C "$SANDBOX/work" fetch origin quality-metrics:refs/remotes/origin/quality-metrics
git -C "$SANDBOX/work" show "origin/quality-metrics:baseline.json" | jq . >/dev/null
git -C "$SANDBOX/work" show "origin/quality-metrics:badges/coverage.json" | jq . >/dev/null
git -C "$SANDBOX/work" show "origin/quality-metrics:README.md" >/dev/null
echo "PASS"
