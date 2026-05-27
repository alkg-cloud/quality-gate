# Rails/Ruby Quality Gate adapter

Copy `adapter.sh` to `./.quality-gate/adapter.sh` in your Rails project, then `chmod +x`.

## Requirements in the consuming project

- Ruby 3.x with bundler.
- Gemfile includes (or has dev/test groups with): `rspec`, `simplecov`, `rubocop`, `flay`, `bundler-audit`.
- `spec/spec_helper.rb` starts SimpleCov: `require "simplecov"; SimpleCov.start`.
- `jq` available on the runner (`apt-get install -y jq` on Linux runners; pre-installed on `ubuntu-latest`).

## What it does

1. Runs `bundle exec rspec` — drives SimpleCov to produce `coverage/.resultset.json`.
2. Reads `.resultset.json` and computes global and per-file line coverage percentages.
3. Runs `bundle exec rubocop --format json` — counts offenses per file.
4. Runs `bundle exec flay` over `app/` and `lib/` — extracts the mass score and normalizes against total source lines to produce a duplication percentage.
5. Walks `app/`, `lib/`, `spec/` for `*.rb` files exceeding `MAX_FILE_LINES`.
6. Runs `bundle exec bundler-audit check --format json` — counts advisories by severity.

## Customize

Common edits:

- **Minitest instead of RSpec**: replace `bundle exec rspec` with `bundle exec rake test`. SimpleCov still works — just ensure `test_helper.rb` starts it.
- **Different paths**: change the `find app lib` and `find app lib spec` clauses.
- **Standard instead of RuboCop**: swap `rubocop --format json` for `standardrb --format json` (output shape is identical).
- **Different duplication strategy**: `flay`'s mass-score is the standard. If you'd rather count semantic duplicates, consider `rubycritic` or skip duplication via `{"_skipped":"reason"}`.

## How an AI agent should approach this

1. Read the project's `Gemfile`/`Gemfile.lock` to confirm which tools are present.
2. Check `spec/spec_helper.rb` or `test/test_helper.rb` for SimpleCov setup — add it if missing.
3. Copy `adapter.sh` to `.quality-gate/adapter.sh`.
4. Adjust the commands to match the project's actual test runner and lint tool.
5. Run locally with `QG_OUTPUT_DIR=/tmp/qg QG_CONFIG=./quality-gate.config.json ./.quality-gate/adapter.sh` and verify six valid JSON files appear in `/tmp/qg`.
6. Commit, open PR.

## Limitations

- The flay-to-percentage mapping is heuristic; it's not directly comparable to jscpd's percentage. Within a single project the ratchet still works because we compare PR to baseline using the same heuristic.
- If your Ruby project doesn't use SimpleCov, coverage is reported as `_skipped`. Add SimpleCov; it's a 3-line install.
