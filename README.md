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

1. Copy `templates/quality-gate.config.json` to repo root; set `default_branch` and `adapter.name`.
2. Write a stack adapter at `./.quality-gate/adapter.sh` (and `setup.sh`, `install.sh`). It MUST satisfy the [adapter contract](./templates/adapters/README.md#adapter-contract-recap).
3. Copy both workflow files from `templates/workflows/` into `.github/workflows/`.
4. Add the required branch protection check: `quality-gate / quality-gate` (single-workspace default — see "Multi-workspace projects" below for monorepo check names).
5. Open the first PR. It bootstraps; merging it creates the orphan branch.

## Multi-workspace projects (monorepos)

The default setup assumes one workspace per repo. For monorepos with multiple workspaces (e.g. `apps/api`, `apps/web`, `apps/mobile`), each workspace gets its own:

- `quality-gate.config.json` (typically at `apps/<workspace>/quality-gate.config.json`)
- adapter script (referenced by that config's `adapter.command`)
- **orphan branch** — override the default via the `QG_BRANCH` env var in the workflow (e.g. `quality-metrics-web`)
- branch-protection required check — one per workflow run / matrix slot

The shipped workflow templates expose `QG_BRANCH` at the workflow level (defaulting to `quality-metrics`) and pass it through to `qg-core pr` / `qg-core update-baseline` via `--branch "$QG_BRANCH"`. Either copy the workflow per workspace and set the workflow-level `QG_BRANCH` in each copy, or run one matrixed workflow and set `QG_BRANCH` **at the job level** so it can read the matrix slot:

```yaml
jobs:
  quality-gate:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        workspace: [api, web, mobile]
    env:
      QG_BRANCH: quality-metrics-${{ matrix.workspace }}   # job-level: matrix context resolves here
    steps:
      # ... same steps as the template ...
```

> The `matrix` context is only available inside the job that declares `strategy.matrix`. If you put `QG_BRANCH: quality-metrics-${{ matrix.workspace }}` in the workflow-level `env:` block (as in the templates), it resolves to an empty suffix and every slot writes to the same branch — defeating the per-workspace split.

Required-check naming follows GitHub's `<workflow_name> / <job_name>` format. With a matrix, expect names like `quality-gate / quality-gate (api)`, `quality-gate / quality-gate (web)`, etc. With separate workflow files per workspace, each workflow's `name:` becomes the prefix. Add **one required check per workspace** to branch protection.

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
