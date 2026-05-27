#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")"/../.. && pwd)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

git init --bare "$SANDBOX/remote.git" >/dev/null
git -c init.defaultBranch=main clone "$SANDBOX/remote.git" "$SANDBOX/work" >/dev/null
git -C "$SANDBOX/work" -c user.email=t@t -c user.name=t commit --allow-empty -m initial >/dev/null
git -C "$SANDBOX/work" push origin HEAD:main >/dev/null

mkdir -p "$SANDBOX/work/qg"
cp -r "$REPO_ROOT/stub_adapter/fixtures/clean/." "$SANDBOX/work/qg/"
cp "$REPO_ROOT/templates/quality-gate.config.json" "$SANDBOX/work/config.json"
cp "$REPO_ROOT/templates/orphan-branch-readme.md" "$SANDBOX/work/orphan-readme.md"

export GITHUB_TOKEN=stub
export GITHUB_REPOSITORY=stub/stub
export GITHUB_SHA="$(git -C "$SANDBOX/work" rev-parse HEAD)"
export GITHUB_REF=refs/heads/main

# Monkey-patch: instead of pushing to https://github.com/stub/stub.git, push to local bare repo.
# We achieve this by setting the orphan helper to use a remoteUrl override via env. The TS CLI
# currently doesn't support that out of the box, so we use simple-git's "url.<base>.insteadOf" config.
git -C "$SANDBOX/work" config "url.$SANDBOX/remote.git.insteadOf" "https://x-access-token:stub@github.com/stub/stub.git"

node "$REPO_ROOT/dist/cli.js" update-baseline \
  --config "$SANDBOX/work/config.json" \
  --output-dir "$SANDBOX/work/qg" \
  --repo-path "$SANDBOX/work" \
  --readme-template "$SANDBOX/work/orphan-readme.md"

git -C "$SANDBOX/work" fetch origin quality-metrics:refs/remotes/origin/quality-metrics
git -C "$SANDBOX/work" show "origin/quality-metrics:baseline.json" | jq . >/dev/null
git -C "$SANDBOX/work" show "origin/quality-metrics:badges/coverage.json" | jq . >/dev/null
git -C "$SANDBOX/work" show "origin/quality-metrics:README.md" >/dev/null
echo "PASS"
