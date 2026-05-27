# @quality-gate/core

Language-agnostic Quality Gate engine for GitHub PRs. Ratchet-based metrics (coverage, lint, file size, duplication, security) stored on an orphan branch in your own repo — no external service required.

Spec: [`docs/superpowers/specs/2026-05-27-quality-gate-design.md`](../../docs/superpowers/specs/2026-05-27-quality-gate-design.md)

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
2. Write a stack adapter at `./.quality-gate/adapter.sh` (and `setup.sh`, `install.sh`). It MUST satisfy the [adapter contract](../../docs/superpowers/specs/2026-05-27-quality-gate-design.md#5-adapter-contract).
3. Copy both workflow files from `templates/workflows/` into `.github/workflows/`.
4. Add the required branch protection check: `quality-gate / quality-gate`.
5. Open the first PR. It bootstraps; merging it creates the orphan branch.

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
