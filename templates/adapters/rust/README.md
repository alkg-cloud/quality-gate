# Rust Quality Gate adapter

Copy `adapter.sh` to `./.quality-gate/adapter.sh` in your Rust project, then `chmod +x`.

## Requirements in the consuming project

- Rust toolchain (`rustup`, `cargo`).
- `cargo-tarpaulin` installed (`cargo install cargo-tarpaulin`). Linux-only; on macOS/Windows tarpaulin is limited — consider alternatives like `cargo llvm-cov`.
- `cargo-audit` installed (`cargo install cargo-audit`).
- `jq` on the runner.

## What it does

1. Runs `cargo tarpaulin --out Json` — produces line coverage per file.
2. Runs `cargo clippy --message-format=json -- -D warnings` — extracts per-file diagnostic counts.
3. Skips duplication (no widely-adopted Rust tool with stable JSON output).
4. Walks `.rs` files (excluding `target/`) for size violations.
5. Runs `cargo audit --json` — counts advisories by severity.

## Customize

- **Replace tarpaulin with llvm-cov**: `cargo llvm-cov --json` is more portable. The JSON shape differs — adjust the jq filter for coverage.
- **More clippy lints**: edit the `-- -D warnings` clause to include or exclude specific lints.
- **Workspace projects**: the script assumes a single crate. For Cargo workspaces, you may need `cargo tarpaulin --workspace`.

## How an AI agent should approach this

1. Confirm the toolchain is installed in CI (`actions-rs/toolchain` GitHub Action or `rustup`).
2. Install `cargo-tarpaulin` and `cargo-audit` in a setup step (or use a pre-built container that includes them — saves 5+ minutes on every PR).
3. Copy `adapter.sh` to `.quality-gate/adapter.sh`.
4. Adjust paths if your project layout differs from the conventional `src/`, `target/`.
5. Run locally and verify outputs.

## Limitations

- Duplication is `_skipped` — there's no standard tool. If your project uses something like `dupemark` or a custom AST-diff tool, replace the duplication section.
- Tarpaulin is Linux-only. If your CI runs on macOS or Windows, swap for `cargo llvm-cov` (which is cross-platform but produces different JSON).
- `cargo audit` reads `Cargo.lock`; projects without a checked-in lockfile (libraries) will have no security data.
