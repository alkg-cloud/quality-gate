# Adopting Quality Gate — AI-agent runbook

You were probably pointed here as **`alkg-cloud/quality-gate/ADOPT.md`** with an
instruction like *"follow these instructions to set up the quality gate in this
repo."* This file is that runbook.

**Read this carefully — you are adopting this engine into a *target* repository
that is NOT this one.** "This repo" / "the target repo" below means the project
you are wiring the gate into. `alkg-cloud/quality-gate` is the *engine* you are
installing; you never modify the engine.

## What the quality gate is (1 paragraph)

A language-agnostic, ratchet-based quality gate for GitHub PRs. On every PR an
**adapter** you write collects metrics (coverage, duplication, lint, file size,
security) into canonical JSON; the engine compares them against a **baseline**
stored on an orphan branch *inside the target repo* and fails the PR on
regression. The baseline is refreshed on every merge to the default branch.
There is no external service and no published npm package — the engine is
installed from source.

## What you will produce in the target repo

By the end you will have committed:

```
quality-gate.config.json            # engine config (repo root, or per-workspace in a monorepo)
.quality-gate/adapter.sh            # executable that emits the 6 metric JSON files
.github/workflows/quality-gate-pr.yml      # runs on PRs
.github/workflows/quality-gate-main.yml    # runs on push to default branch (internal name: quality-gate-baseline)
```

…and opened a **bootstrap PR**. Merging it creates the orphan branch and the
first baseline.

## Source of truth — read these first (do not skip)

This runbook summarizes the contract, but the authoritative definitions live in
the engine repo. Read them before writing anything. If you have the engine repo
checked out, read the paths directly; otherwise fetch the raw files from
`https://raw.githubusercontent.com/alkg-cloud/quality-gate/main/<path>`:

| Path | Why |
|------|-----|
| `README.md` | Overview, badge embeds, monorepo section |
| `templates/adapters/README.md` | The **adapter contract** (authoritative) |
| `src/schemas/*.json` | The exact JSON schema each metric file must satisfy |
| `templates/quality-gate.config.json` | Config template to copy |
| `templates/workflows/quality-gate-pr.yml`, `…-main.yml` | Workflows to copy verbatim |
| `templates/adapters/{react,rails,rust}/adapter.sh` | Reference adapters to start from |

## Step 1 — Detect the stack and pick a starting adapter

Inspect the target repo (`package.json`, `Gemfile`, `Cargo.toml`,
`pyproject.toml`, `go.mod`, …). Pick the closest reference adapter:

- JS/TS → `templates/adapters/react/` (jest/vitest, eslint, jscpd, npm-audit)
- Ruby/Rails → `templates/adapters/rails/` (rspec+simplecov, rubocop, flay, bundler-audit)
- Rust → `templates/adapters/rust/` (tarpaulin, clippy, cargo-audit; duplication skipped)
- No match → start from `react/` (it's ~60 lines) and replace the tool invocations.

## Step 2 — Create `quality-gate.config.json`

Copy `templates/quality-gate.config.json` to the target repo root and edit:

- `default_branch` — the repo's default branch (e.g. `main`).
- `adapter.command` — path to your adapter, normally `./.quality-gate/adapter.sh`.
- `adapter.name` — your stack name (free-form, e.g. `node`, `rails`).
- `branch` — leave as `quality-metrics` unless this is a monorepo (see Step 6).

Keep `thresholds`, `ratchet`, and `metrics` as in the template unless you have a
concrete reason. `metrics.<m>.enabled: false` disables a metric entirely;
prefer `_skipped` from the adapter (Step 3) when a tool merely isn't present.

## Step 3 — Write `.quality-gate/adapter.sh` (the adapter contract)

The adapter is any executable that reads two env vars and writes canonical JSON.
It MUST:

- Read **`$QG_OUTPUT_DIR`** and **`$QG_CONFIG`** from the environment.
  (`$QG_MODE` is also set — `pr` or `main` — but you usually don't need it.)
- Write these **six** files into `$QG_OUTPUT_DIR`:
  `coverage.json`, `duplication.json`, `lint.json`, `file_size.json`,
  `security.json`, `_meta.json`.
- Make each file **either** match its schema in `src/schemas/` **or** be exactly
  `{"_skipped":"<reason>"}` when the metric doesn't apply (e.g. no coverage tool).
- Be **deterministic**: no timestamps in bodies, arrays sorted by path.
- Exit non-zero only if a *required* tool genuinely fails to run.

Critical rules:

- **Never fabricate data.** A metric with no tooling is `_skipped`, not `0` or
  fake numbers. `_skipped` is a first-class, non-fatal state end-to-end.
- **Match the schemas exactly.** Read `src/schemas/<metric>.schema.json`; the
  collector validates every file and rejects shape mismatches.
- `chmod +x .quality-gate/adapter.sh`.

## Step 4 — Install the engine and verify locally (before any PR)

Install the `qg-core` CLI from source (no npm registry needed):

```bash
curl -fsSL https://raw.githubusercontent.com/alkg-cloud/quality-gate/main/install.sh | bash
# qg-core is now on PATH (or follow the printed `export PATH=...` hint)
```

Then exercise the full pipeline and confirm it's green **before** opening a PR:

```bash
QG_OUTPUT_DIR=/tmp/qg QG_CONFIG=./quality-gate.config.json ./.quality-gate/adapter.sh
qg-core collect --input /tmp/qg --output /tmp/qg/metrics.json
qg-core compare --metrics /tmp/qg/metrics.json --baseline NONE \
  --config ./quality-gate.config.json --output /tmp/qg/report.json
```

`collect` validates the adapter output against the schemas — any error means the
adapter's JSON is wrong; fix it. `compare … --baseline NONE` is bootstrap mode
and **must** report `gate_passed: true`. Iterate until both succeed.

## Step 5 — Add the workflows

Copy **both** files from `templates/workflows/` into the target repo's
`.github/workflows/` **without editing their logic**:

- `quality-gate-pr.yml` (runs on PRs; posts the sticky comment)
- `quality-gate-main.yml` (runs on push to default branch; updates the baseline)

They already: install the engine via `curl | bash` with `shell: bash`, read your
`adapter.command` from the config, run the adapter with `QG_OUTPUT_DIR` /
`QG_MODE` / `QG_CONFIG` set, and call `qg-core`. The only thing they rely on from
you is a correct `quality-gate.config.json` at the path they reference (repo root
by default).

For reproducible CI, consider pinning the engine: set `QG_REF` in the install
step's `env:` to a tag or commit SHA (default is the mutable `main`).

## Step 6 — Monorepo only

For multiple workspaces (`apps/api`, `apps/web`, …), each workspace gets:

- its own `quality-gate.config.json` (e.g. `apps/web/quality-gate.config.json`),
- its own adapter (referenced by that config's `adapter.command`),
- its own **orphan branch** via the config's `branch` field (e.g. `quality-metrics-web`),
- its own required check.

Run one matrixed workflow that points `qg-core` at the per-workspace config, or
copy the workflow per workspace. See the "Multi-workspace projects" section of
the engine README for the exact matrix example and required-check naming.

## Step 7 — Open the bootstrap PR (do NOT merge it yourself)

Commit the four files on a branch and open a PR. It runs in **bootstrap** mode:
the gate passes (no baseline yet) and posts a comment explaining the baseline
will be created on first merge.

Then report back to the human — these require admin and an explicit decision:

1. **Branch protection:** add the required status check. Single-workspace default
   is **`quality-gate / quality-gate`** (`<workflow name> / <job name>`). In a
   monorepo add one check per workspace (e.g. `quality-gate / quality-gate (web)`).
   You cannot set this yourself; ask the human to.
2. **Merge** the bootstrap PR. Merging creates the orphan branch (default
   `quality-metrics`) and the first baseline. Do not merge without authorization.

## Guardrails (apply throughout)

- Do not modify the engine repo, the copied workflow logic, or the schemas.
- Do not invent metric values; absent tooling ⇒ `{"_skipped":"reason"}`.
- Do not publish anything to an external service.
- Ask before any irreversible/shared action: merging, editing branch protection,
  pushing to a protected branch.

## Definition of done

- [ ] `quality-gate.config.json` exists with correct `default_branch`, `adapter.command`, `adapter.name`.
- [ ] `.quality-gate/adapter.sh` is executable and emits 6 schema-valid (or `_skipped`) files.
- [ ] `qg-core collect` passes and `qg-core compare … --baseline NONE` reports `gate_passed: true`.
- [ ] Both workflows are in `.github/workflows/`, logic unedited.
- [ ] A bootstrap PR is open; the human knows which required check to add and that merge creates the baseline.

## Troubleshooting

- **`collect` rejects a file** — its shape doesn't match `src/schemas/<metric>.schema.json`. Compare field-by-field; fix the adapter's jq/output. Use `_skipped` if the metric truly doesn't apply.
- **`qg-core: command not found` in CI** — the install step failed or didn't run before the step that uses it. The shipped templates set `shell: bash` and run install as an earlier step; don't reorder them.
- **Gate fails on a metric you don't run** — you emitted real data (often `0`) instead of `_skipped`, so the ratchet now enforces it. Switch that file to `{"_skipped":"reason"}`.
- **Badge embed 404s** — per-metric badges only exist while the metric is live; embed `quality.json` (always published) for a badge that never breaks.
