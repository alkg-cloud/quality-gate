#!/usr/bin/env bash
#
# Official install-from-source script for @quality-gate/core (nvm/rustup style).
#
# Since the engine is not published to npm, this fetches a pinned source tarball
# from GitHub, builds it, and installs a `qg-core` shim on your PATH. A second run
# for the same ref is a no-op (cached under $QG_HOME).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/alkg-cloud/quality-gate/main/install.sh | bash
#
# Pin a ref for reproducible installs (recommended for CI):
#   curl -fsSL .../install.sh | QG_REF=v0.1.0 bash
#
# Environment:
#   QG_REPO         GitHub owner/repo to install from   (default: alkg-cloud/quality-gate)
#   QG_REF          git ref (tag/branch/sha) to install (default: main)
#   QG_HOME         install root                        (default: $HOME/.quality-gate)
#   QG_ARCHIVE_URL  override the tarball URL entirely    (default: derived from QG_REPO/QG_REF)
#   QG_FORCE        set to 1 to reinstall even if cached (default: unset)
#
# In GitHub Actions the shim's bin dir is appended to $GITHUB_PATH, so subsequent
# steps can call `qg-core ...` directly. Locally, follow the printed PATH hint.
set -euo pipefail

QG_REPO="${QG_REPO:-alkg-cloud/quality-gate}"
QG_REF="${QG_REF:-main}"
QG_HOME="${QG_HOME:-$HOME/.quality-gate}"
QG_ARCHIVE_URL="${QG_ARCHIVE_URL:-https://github.com/${QG_REPO}/archive/${QG_REF}.tar.gz}"

log()  { printf 'quality-gate: %s\n' "$*" >&2; }
die()  { printf 'quality-gate: error: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Sanitize the ref so it is a safe single path segment (e.g. refs/heads/main → refs-heads-main).
ref_slug="$(printf '%s' "$QG_REF" | tr '/' '-' | tr -cd '[:alnum:]._-')"
[ -n "$ref_slug" ] || die "QG_REF '$QG_REF' produced an empty install slug"

install_dir="$QG_HOME/versions/$ref_slug"
bin_dir="$QG_HOME/bin"
shim="$bin_dir/qg-core"
cli="$install_dir/dist/cli.js"

have node || die "node is required but was not found on PATH"

download() {
  local url="$1" dest="$2"
  if have curl; then
    curl -fsSL "$url" -o "$dest"
  elif have wget; then
    wget -qO "$dest" "$url"
  else
    die "neither curl nor wget is available to download $url"
  fi
}

install_engine() {
  local tmp tarball
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" RETURN
  tarball="$tmp/qg.tar.gz"

  log "fetching $QG_ARCHIVE_URL"
  download "$QG_ARCHIVE_URL" "$tarball"

  rm -rf "$install_dir"
  mkdir -p "$install_dir"
  # GitHub archives nest everything under a top-level dir; --strip-components drops it.
  tar -xzf "$tarball" -C "$install_dir" --strip-components=1

  if [ -f "$cli" ]; then
    log "prebuilt dist/ found in tarball; skipping build"
  else
    have npm || die "npm is required to build the engine but was not found on PATH"
    log "building engine (npm install && npm run build)"
    ( cd "$install_dir" && npm install --no-audit --no-fund && npm run build )
    [ -f "$cli" ] || die "build completed but $cli is missing"
  fi
}

if [ -f "$cli" ] && [ "${QG_FORCE:-}" != "1" ]; then
  log "ref '$QG_REF' already installed at $install_dir (set QG_FORCE=1 to reinstall)"
else
  install_engine
fi

mkdir -p "$bin_dir"
cat > "$shim" <<EOF
#!/usr/bin/env bash
exec node "$cli" "\$@"
EOF
chmod +x "$shim"
log "installed qg-core shim at $shim"

# Expose on PATH for subsequent GitHub Actions steps.
if [ -n "${GITHUB_PATH:-}" ]; then
  if [ ! -f "$GITHUB_PATH" ] || ! grep -qxF "$bin_dir" "$GITHUB_PATH"; then
    printf '%s\n' "$bin_dir" >> "$GITHUB_PATH"
    log "added $bin_dir to \$GITHUB_PATH (available in later steps)"
  fi
fi

log "done. To use qg-core in this shell:"
printf 'export PATH="%s:$PATH"\n' "$bin_dir"
