# React/Node Quality Gate adapter

Copy `adapter.sh` to `./.quality-gate/adapter.sh` in your project, then `chmod +x`.

## Requirements in the consuming project

- `jest` available via `npx` (or local install).
- `eslint` available via `npx` (or local install).
- `jscpd` runs via `npx --yes` (no install needed).
- `npm audit` available (comes with npm).
- `jq` available on the runner (pre-installed on `ubuntu-latest`).
- A `jest.config.*` that produces coverage when invoked with `--coverageReporters=json-summary`.
- An `.eslintrc.*` (or `eslint.config.js`) that lints `.js, .jsx, .ts, .tsx, .mjs, .cjs` files.

## Customize for your project

Edit `adapter.sh` directly. Common changes:

- **Different test framework** (e.g. vitest): replace the `npx jest ...` command with `npx vitest run --coverage --coverage.reporter=json-summary`. Output file path matches (`coverage/coverage-summary.json`).
- **Different file extensions**: edit the `find` clause in the file-size section to include your extensions.
- **Different package manager** (`pnpm`/`yarn`): for `audit`, swap `npm audit` for `pnpm audit --json` or `yarn npm audit --json`. The JSON shape differs — verify and adjust the jq filter.
- **Skip a metric**: write the metric file with `{"_skipped":"reason"}` and don't run its tool.

## How an AI agent should approach this

When bootstrapping the gate in a real React project:

1. Read the project's `package.json` to learn the test/lint/coverage tooling actually used.
2. Copy `adapter.sh` to `.quality-gate/adapter.sh` in the project.
3. Adjust the lines that invoke the tools to match what's actually configured.
4. Run `.quality-gate/adapter.sh` once locally to confirm it produces six valid JSON files.
5. Verify each JSON file matches the schema (the engine's `qg-core collect` does this).
6. Commit, open PR.
