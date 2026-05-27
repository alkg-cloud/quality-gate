# qg-core — Quality Gate Universal Engine

Language- and tool-agnostic engine for ratchet-based quality gates in GitHub PRs.
Spec: [`docs/superpowers/specs/2026-05-27-quality-gate-design.md`](../../docs/superpowers/specs/2026-05-27-quality-gate-design.md).

## What it does

- Reads canonical JSON files produced by a **stack adapter** (you write this — see Plans 2–4 for React/Rails/Rust examples).
- Compares against a frozen baseline stored on a `quality-metrics` orphan branch in your repo.
- Posts a sticky PR comment, generates shields.io badges, writes a machine-readable report for AI babysit agents.
- Auto-bootstraps the baseline on first merge to your default branch. No external service required.

## Install (CI)

In the workflow:

```yaml
- name: Install qg_core
  run: pip install qg-core
```

## CLI

```
qg collect       --input <dir> --output metrics.json
qg compare       --metrics metrics.json --baseline baseline.json|NONE --config config.json --output report.json
qg report        --metrics metrics.json --baseline baseline.json|NONE --report report.json --output pr-comment.md
qg render-badges --metrics metrics.json --output-dir badges/
qg baseline-payload --metrics metrics.json --config config.json --commit-sha <sha> --ref refs/heads/main --output baseline.json
qg commit-message   --short-sha <sha> --before <pct>|NONE --after <pct>
qg exit-code     --report report.json    # exits 0 if passed, 1 otherwise
```

## Badge embed

```markdown
![coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/<owner>/<repo>/quality-metrics/badges/coverage.json)
![quality](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/<owner>/<repo>/quality-metrics/badges/quality.json)
```

## For AI agents wiring this into a project

1. Copy `templates/quality-gate.config.json` to repo root; set `default_branch` and `adapter.name`.
2. Pick or write a stack adapter at `./.quality-gate/adapter.sh` (and `setup.sh`, `install.sh`). It MUST satisfy the [adapter contract](../../docs/superpowers/specs/2026-05-27-quality-gate-design.md#5-adapter-contract).
3. Copy both workflow files from `templates/workflows/` into `.github/workflows/`.
4. Add the required branch protection check: `quality-gate / quality-gate`.
5. Open the first PR. It bootstraps; merging it creates the orphan branch.

## Development

```bash
pip install -e .[dev]
pytest                   # unit tests
bash tests/integration/test_e2e_bootstrap.sh
bash tests/integration/test_e2e_pr_passing.sh
bash tests/integration/test_e2e_pr_failing.sh
bash tests/integration/test_e2e_main_update.sh
ruff check qg_core tests
mypy qg_core
```
