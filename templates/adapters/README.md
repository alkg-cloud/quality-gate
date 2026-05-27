# Quality Gate adapter templates

This directory contains reference adapter scripts. Each one is a self-contained shell + jq pipeline that satisfies the [adapter contract](../../../docs/superpowers/specs/2026-05-27-quality-gate-design.md#5-adapter-contract):

> "An adapter is any executable program that reads environment variables and writes canonical JSON files to an output directory."

## When to use these templates

These are **starting points**, not finished products. The intended workflow:

1. Pick the template closest to your project's stack.
2. Copy `<stack>/adapter.sh` to your project at `./.quality-gate/adapter.sh`.
3. Customize the tool invocations to match your project's actual tooling.
4. Verify locally with `QG_OUTPUT_DIR=/tmp/qg QG_CONFIG=./quality-gate.config.json ./.quality-gate/adapter.sh` — you should see six valid JSON files in `/tmp/qg`.
5. Commit and let CI take over.

## Available templates

| Stack | Tools | Status |
|-------|-------|--------|
| [`react/`](./react/) | jest, eslint, jscpd, npm-audit | ✅ Live-tested |
| [`rails/`](./rails/) | rspec, simplecov, rubocop, flay, bundler-audit | ✅ Syntax-validated |
| [`rust/`](./rust/) | cargo-tarpaulin, cargo-clippy, cargo-audit | ✅ Syntax-validated (duplication skipped) |

## Adapter contract recap

The adapter MUST:

- Read `$QG_OUTPUT_DIR` and `$QG_CONFIG` from the environment.
- Write the six files below into `$QG_OUTPUT_DIR`:
  - `coverage.json`
  - `duplication.json`
  - `lint.json`
  - `file_size.json`
  - `security.json`
  - `_meta.json`
- Produce deterministic output (no timestamps in bodies, sorted arrays by path).
- Exit non-zero if a required tool fails to run AND the metric is mandatory.

Each metric file either matches the schema in [`src/schemas/`](../../src/schemas/) or contains `{"_skipped":"reason"}` to declare the metric inapplicable.

## How an AI agent should approach picking + customizing

1. **Detect the stack:** look at `package.json`, `Gemfile`, `Cargo.toml`, `pyproject.toml`, etc.
2. **Pick the closest template.** No exact match? Take the structurally closest one (e.g. for Go, start from `react/` and replace tools).
3. **Substitute tool invocations.** The script comments tell you what each section produces. If the project uses `vitest` instead of `jest`, change the test command; the output path (`coverage/coverage-summary.json`) is conventionally the same.
4. **Verify the schema:** run the engine's `qg-core collect --input $QG_OUTPUT_DIR --output metrics.json`. The collector validates each JSON. Any failure means the adapter's output is wrong — fix the jq filter.
5. **Confirm pass/fail locally:** run `qg-core compare --metrics metrics.json --baseline NONE --config quality-gate.config.json --output report.json`. Bootstrap mode should pass.
6. **Open PR.** The engine takes over from here.

## What if my stack isn't here

Write a new adapter. The contract is small — the React template is ~60 lines and replicating it for a new stack is mechanical. If your stack is broadly useful, send a PR adding a new directory under `templates/adapters/<stack>/`.
