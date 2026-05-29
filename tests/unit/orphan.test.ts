import { describe, expect, it } from "vitest";

import { buildBaselinePayload, formatCommitMessage, resolveBranch } from "../../src/orphan.js";
import type { Metrics, QGConfig } from "../../src/types.js";

const META = { adapter: "stub", adapter_version: "0.1", tools: [] as string[] };

function metrics(): Metrics {
  return {
    coverage:    { lines_pct: 80, files: { "a.ts": 100 } },
    duplication: { pct: 1 },
    lint:        { total: 0, by_file: {} },
    file_size:   { max_lines: 300, violations: {} },
    security:    { critical: 0, high: 0, moderate: 0, low: 0 },
    _meta: META,
  };
}

function config(): QGConfig {
  return {
    schema_version: 1, default_branch: "main",
    thresholds: { MAX_FILE_LINES: 300, MIN_NEW_FILE_COVERAGE: 60 },
    ratchet: { strict: true, epsilon: 0 },
    metrics: {
      coverage: { enabled: true }, duplication: { enabled: true },
      lint: { enabled: true }, file_size: { enabled: true },
      security: { enabled: true, block_severities: ["critical"], warn_severities: ["high"] },
    },
    adapter: { command: "./a.sh", name: "stub", version: "0.1" },
  };
}

describe("buildBaselinePayload", () => {
  it("includes required fields", () => {
    const p = buildBaselinePayload(metrics(), config(), {
      commitSha: "a".repeat(40), ref: "refs/heads/main", nowIso: "2026-05-27T12:00:00Z",
    });
    expect(p.schema_version).toBe(1);
    expect(p.commit_sha).toBe("a".repeat(40));
    expect(p.metrics.coverage).toEqual({ lines_pct: 80, files: { "a.ts": 100 } });
    expect(p.config_snapshot.MAX_FILE_LINES).toBe(300);
  });
});

describe("resolveBranch", () => {
  it("prefers the explicit flag over config and default", () => {
    const cfg = { ...config(), branch: "quality-metrics-web" };
    expect(resolveBranch("flag-branch", cfg)).toBe("flag-branch");
  });

  it("falls back to config.branch when no flag is given", () => {
    const cfg = { ...config(), branch: "quality-metrics-web" };
    expect(resolveBranch(undefined, cfg)).toBe("quality-metrics-web");
  });

  it("falls back to the quality-metrics default when neither flag nor config set it", () => {
    expect(resolveBranch(undefined, config())).toBe("quality-metrics");
  });
});

describe("formatCommitMessage", () => {
  it("includes coverage delta", () => {
    const m = formatCommitMessage({ shortSha: "abc1234", coverageBefore: 7.0, coverageAfter: 7.2 });
    expect(m).toContain("abc1234");
    expect(m).toContain("7%");
    expect(m).toContain("7.2%");
  });

  it("formats as bootstrap when no prior coverage", () => {
    const m = formatCommitMessage({ shortSha: "abc1234", coverageBefore: null, coverageAfter: 7.0 });
    expect(m.toLowerCase()).toContain("bootstrap");
  });
});
