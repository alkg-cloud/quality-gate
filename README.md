# @quality-gate/core

Language-agnostic Quality Gate engine for GitHub PRs. Ratchet-based metrics (coverage, lint, file size, duplication, security) stored on an orphan branch in your own repo — no external service required.

## Install

```bash
npm install --save-dev @quality-gate/core
# or
pnpm add -D @quality-gate/core
# or, no install:
npx @quality-gate/core@0.1.0 --help
```

## CLI

```
qg-core pr                --config <path> --output-dir <dir>
qg-core update-baseline   --config <path> --output-dir <dir>
qg-core collect           --input <dir>   --output metrics.json
qg-core compare           --metrics metrics.json --baseline baseline.json|NONE --config config.json --output report.json
qg-core report            --metrics metrics.json --baseline baseline.json|NONE --report report.json --output pr-comment.md
qg-core render-badges     --metrics metrics.json --output-dir badges/
qg-core baseline-payload  --metrics metrics.json --config config.json --commit-sha <sha> --ref refs/heads/main --output baseline.json
qg-core commit-message    --short-sha <sha> --before <pct>|NONE --after <pct>
qg-core exit-code         --report report.json
```

## Badge embed

```markdown
![coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/<owner>/<repo>/quality-metrics/badges/coverage.json)
![quality](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/<owner>/<repo>/quality-metrics/badges/quality.json)
```

## For AI agents wiring this into a project

1. Copy `templates/quality-gate.config.json` to repo root; set `default_branch` and `adapter.name`. Leave `branch` as `quality-metrics` unless this is a monorepo (see below).
2. Write a stack adapter at `./.quality-gate/adapter.sh` (and `setup.sh`, `install.sh`). It MUST satisfy the [adapter contract](./templates/adapters/README.md#adapter-contract-recap).
3. Copy both workflow files from `templates/workflows/` into `.github/workflows/`.
4. Add the required branch protection check: `quality-gate / quality-gate` (single-workspace default — see "Multi-workspace projects" below for monorepo check names).
5. Open the first PR. It bootstraps; merging it creates the orphan branch.

## Multi-workspace projects (monorepos)

The default setup assumes one workspace per repo. For monorepos with multiple workspaces (e.g. `apps/api`, `apps/web`, `apps/mobile`), each workspace gets its own:

- `quality-gate.config.json` (typically at `apps/<workspace>/quality-gate.config.json`)
- adapter script (referenced by that config's `adapter.command`)
- **orphan branch** — set the `branch` field in that workspace's config (e.g. `quality-metrics-web`)
- branch-protection required check — one per workflow / matrix slot

Orphan-branch identity lives in the config, not the workflow: the engine resolves the branch as `--branch` flag → `config.branch` → `quality-metrics` default. So pointing `qg-core` at a workspace's config is enough to target the right branch — local runs and CI stay in sync with no extra flags. Run one matrixed workflow that selects the per-workspace config:

```yaml
jobs:
  quality-gate:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        workspace: [api, web, mobile]
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      # Copy the "Read adapter command from config" + "Run adapter" steps from the
      # PR template here, passing QG_CONFIG=./apps/${{ matrix.workspace }}/quality-gate.config.json
      # so the adapter writes metrics before the gate runs.
      - name: Run quality gate
        run: npx --yes @quality-gate/core@0.1.0 pr --config ./apps/${{ matrix.workspace }}/quality-gate.config.json --output-dir ${{ runner.temp }}/qg
```

Each workspace's config declares its own `branch`, so the matrix slot needs no branch knowledge. (Alternatively, copy the workflow per workspace and let each point at its own config.)

Required-check naming follows GitHub's `<workflow_name> / <job_name>` format. With a matrix, expect names like `quality-gate / quality-gate (api)`, `quality-gate / quality-gate (web)`, etc. With separate workflow files per workspace, each workflow's `name:` becomes the prefix. Add **one required check per workspace** to branch protection. The shipped templates key their `concurrency` group off `github.workflow`, so per-workspace workflow copies (distinct names) don't serialize against each other.

Workspaces cannot share an orphan branch by subpath: the per-branch layout (`baseline.json`, `badges/`, `history/` at the branch root) is hardcoded, so each workspace needs its own branch.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
for t in tests/integration/e2e-*.sh; do bash "$t"; done
```

## Programmatic API

```typescript
import { collect, compare, renderPrComment, renderBadges } from "@quality-gate/core";

const metrics = collect("./qg-output");
const report  = compare(metrics, baseline, config);   // baseline can be null for bootstrap
const md      = renderPrComment(metrics, baseline, report);
const badges  = renderBadges(metrics);
```
