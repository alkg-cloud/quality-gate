import { describe, expect, it } from "vitest";

import { compare } from "../../src/comparator.js";
import type { Baseline, Metrics, QGConfig } from "../../src/types.js";

const META = { adapter: "stub", adapter_version: "0.1", tools: [] as string[] };

function baseline(): Baseline {
  return {
    schema_version: 1,
    updated_at: "2026-05-26T00:00:00Z",
    commit_sha: "a".repeat(40),
    ref: "refs/heads/main",
    metrics: {
      coverage:    { lines_pct: 80, files: { "a.ts": 100, "b.ts": 60 } },
      duplication: { pct: 2 },
      lint:        { total: 5, by_file: { "a.ts": 5 } },
      file_size:   { max_lines: 300, violations: { "big.ts": 999 } },
      security:    { critical: 0, high: 1, moderate: 0, low: 0 },
    },
    config_snapshot: { MAX_FILE_LINES: 300, MIN_NEW_FILE_COVERAGE: 60, ratchet_strict: true },
  };
}

function config(): QGConfig {
  return {
    schema_version: 1,
    default_branch: "main",
    thresholds: { MAX_FILE_LINES: 300, MIN_NEW_FILE_COVERAGE: 60 },
    ratchet: { strict: true, epsilon: 0 },
    metrics: {
      coverage:    { enabled: true },
      duplication: { enabled: true },
      lint:        { enabled: true },
      file_size:   { enabled: true },
      security:    { enabled: true, block_severities: ["critical"], warn_severities: ["high"] },
    },
    adapter: { command: "./a.sh", name: "stub", version: "0.1" },
  };
}

function metricsFromBaseline(b: Baseline): Metrics {
  return { ...b.metrics, _meta: META };
}

describe("comparator: global ratchet + security blocker", () => {
  it("passes when PR matches baseline", () => {
    const b = baseline();
    const r = compare(metricsFromBaseline(b), b, config());
    expect(r.gate_passed).toBe(true);
    expect(r.regressions).toEqual([]);
  });

  it("fails on any coverage drop", () => {
    const b = baseline();
    const m = metricsFromBaseline(b);
    m.coverage = { lines_pct: 79.99, files: (b.metrics.coverage as { files: Record<string, number> }).files };
    const r = compare(m, b, config());
    expect(r.gate_passed).toBe(false);
    expect(r.regressions.some(x => x.metric === "coverage" && x.scope === "global")).toBe(true);
  });

  it("fails on any duplication increase", () => {
    const b = baseline();
    const m = metricsFromBaseline(b);
    m.duplication = { pct: 2.01 };
    const r = compare(m, b, config());
    expect(r.gate_passed).toBe(false);
    expect(r.regressions.some(x => x.metric === "duplication")).toBe(true);
  });

  it("blocks on critical security even when baseline also had it", () => {
    const b = baseline();
    b.metrics.security = { critical: 1, high: 1, moderate: 0, low: 0 };
    const m = metricsFromBaseline(b);
    const r = compare(m, b, config());
    expect(r.gate_passed).toBe(false);
    expect(r.regressions.some(x => x.metric === "security" && x.scope === "critical_blocker")).toBe(true);
  });

  it("warns but does not block on high severity", () => {
    const b = baseline();
    const m = metricsFromBaseline(b);
    m.security = { critical: 0, high: 2, moderate: 0, low: 0 };
    const r = compare(m, b, config());
    expect(r.gate_passed).toBe(true);
    expect(r.warnings.some(w => w.metric === "security" && w.severity === "high" && w.count === 2)).toBe(true);
  });
});

describe("comparator: per-file ratchet + new-file rules", () => {
  it("detects per-file lint regression even when total unchanged", () => {
    const b = baseline();
    b.metrics.lint = { total: 10, by_file: { "a.ts": 5, "b.ts": 5 } };
    const m = metricsFromBaseline(b);
    m.lint = { total: 10, by_file: { "a.ts": 8, "b.ts": 2 } };
    const r = compare(m, b, config());
    expect(r.gate_passed).toBe(false);
    expect(r.regressions.some(x => x.metric === "lint" && x.scope === "file" && x.file === "a.ts" && x.actual === 8)).toBe(true);
  });

  it("flags new file with violations as regression", () => {
    const b = baseline();
    const m = metricsFromBaseline(b);
    m.lint = { total: 7, by_file: { "a.ts": 5, "new.ts": 2 } };
    const r = compare(m, b, config());
    expect(r.regressions.some(x => x.metric === "lint" && x.scope === "new_file" && x.file === "new.ts")).toBe(true);
  });

  it("flags new oversized file above limit", () => {
    const b = baseline();
    const m = metricsFromBaseline(b);
    m.file_size = { max_lines: 300, violations: { "big.ts": 999, "new_big.ts": 500 } };
    const r = compare(m, b, config());
    expect(r.regressions.some(x => x.metric === "file_size" && x.file === "new_big.ts")).toBe(true);
  });

  it("flags existing file that grew", () => {
    const b = baseline();
    const m = metricsFromBaseline(b);
    m.file_size = { max_lines: 300, violations: { "big.ts": 1200 } };
    const r = compare(m, b, config());
    expect(r.regressions.some(x => x.metric === "file_size" && x.file === "big.ts" && (x.delta ?? 0) > 0)).toBe(true);
  });

  it("enforces new-file coverage floor", () => {
    const b = baseline();
    const m = metricsFromBaseline(b);
    m.coverage = { lines_pct: 80, files: { "a.ts": 100, "b.ts": 60, "new.ts": 42 } };
    const r = compare(m, b, config());
    expect(r.regressions.some(x => x.metric === "coverage" && x.scope === "new_file_floor" && x.file === "new.ts")).toBe(true);
  });
});

describe("comparator: bootstrap mode", () => {
  it("passes when no baseline and clean security", () => {
    const m: Metrics = {
      coverage:    { lines_pct: 1, files: { "a.ts": 0 } },
      duplication: { pct: 50 },
      lint:        { total: 1000, by_file: { "a.ts": 1000 } },
      file_size:   { max_lines: 300, violations: { "a.ts": 9999 } },
      security:    { critical: 0, high: 5, moderate: 0, low: 0 },
      _meta: META,
    };
    const r = compare(m, null, config());
    expect(r.gate_passed).toBe(true);
    expect(r.bootstrap).toBe(true);
  });

  it("still blocks critical security in bootstrap mode", () => {
    const m: Metrics = {
      coverage:    { lines_pct: 1, files: {} },
      duplication: { pct: 1 },
      lint:        { total: 0, by_file: {} },
      file_size:   { max_lines: 300, violations: {} },
      security:    { critical: 1, high: 0, moderate: 0, low: 0 },
      _meta: META,
    };
    const r = compare(m, null, config());
    expect(r.gate_passed).toBe(false);
    expect(r.bootstrap).toBe(true);
  });
});
