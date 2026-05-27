import { describe, expect, it } from "vitest";

import { renderBadges, renderPrComment } from "../../src/reporter.js";
import type { Baseline, ComparatorReport, Metrics } from "../../src/types.js";

const META = { adapter: "stub", adapter_version: "0.1", tools: ["fake"] };

function cleanMetrics(): Metrics {
  return {
    coverage:    { lines_pct: 80, files: {} },
    duplication: { pct: 1 },
    lint:        { total: 0, by_file: {} },
    file_size:   { max_lines: 300, violations: {} },
    security:    { critical: 0, high: 0, moderate: 0, low: 0 },
    _meta: META,
  };
}

function passingReport(): ComparatorReport {
  return { gate_passed: true, regressions: [], warnings: [], passing: ["coverage_global"], bootstrap: false };
}

function fakeBaseline(m: Metrics): Baseline {
  return {
    schema_version: 1,
    updated_at: "2026-05-26T00:00:00Z",
    commit_sha: "abc123" + "0".repeat(34),
    ref: "refs/heads/main",
    metrics: {
      coverage: m.coverage, duplication: m.duplication, lint: m.lint,
      file_size: m.file_size, security: m.security,
    },
    config_snapshot: { MAX_FILE_LINES: 300, MIN_NEW_FILE_COVERAGE: 60, ratchet_strict: true },
  };
}

describe("renderPrComment", () => {
  it("renders success header on passing report", () => {
    const m = cleanMetrics();
    const md = renderPrComment(m, fakeBaseline(m), passingReport());
    expect(md).toContain("<!-- quality-gate-marker:v1 -->");
    expect(md).toContain("✅ PASSED");
    expect(md).toContain("Baseline: `abc123`");
  });

  it("lists regressions on failing report", () => {
    const m = cleanMetrics();
    m.lint = { total: 5, by_file: { "a.ts": 5 } };
    const baseline = fakeBaseline(cleanMetrics());
    const report: ComparatorReport = {
      gate_passed: false,
      regressions: [{ metric: "lint", scope: "file", file: "a.ts", baseline: 0, actual: 5, delta: 5 }],
      warnings: [], passing: [], bootstrap: false,
    };
    const md = renderPrComment(m, baseline, report);
    expect(md).toContain("❌ FAILED");
    expect(md).toContain("a.ts");
    expect(md).toContain("+5");
  });

  it("explains bootstrap on first run", () => {
    const m = cleanMetrics();
    const report: ComparatorReport = { gate_passed: true, regressions: [], warnings: [], passing: [], bootstrap: true };
    const md = renderPrComment(m, null, report);
    expect(md).toContain("Bootstrap pending");
  });

  it("lists warnings separately from regressions", () => {
    const m = cleanMetrics();
    m.security = { critical: 0, high: 2, moderate: 0, low: 0 };
    const baseline = fakeBaseline(cleanMetrics());
    const report: ComparatorReport = {
      gate_passed: true,
      regressions: [],
      warnings: [{ metric: "security", severity: "high", count: 2, delta: 0 }],
      passing: [], bootstrap: false,
    };
    const md = renderPrComment(m, baseline, report);
    expect(md).toContain("Warnings");
    expect(md).toContain("high");
  });

  it("renders deterministically", () => {
    const m = cleanMetrics();
    const baseline = fakeBaseline(m);
    const md1 = renderPrComment(m, baseline, passingReport());
    const md2 = renderPrComment(m, baseline, passingReport());
    expect(md1).toBe(md2);
  });
});

interface BadgeJson { color: string; message: string }

describe("renderBadges", () => {
  it("coverage badge is brightgreen at 85%", () => {
    const m = cleanMetrics();
    m.coverage = { lines_pct: 85, files: {} };
    const b = JSON.parse(renderBadges(m)["coverage.json"]!) as BadgeJson;
    expect(b.color).toBe("brightgreen");
    expect(b.message).toBe("85%");
  });

  it("coverage badge is red at 7%", () => {
    const m = cleanMetrics();
    m.coverage = { lines_pct: 7, files: {} };
    const b = JSON.parse(renderBadges(m)["coverage.json"]!) as BadgeJson;
    expect(b.color).toBe("red");
  });

  it("composite quality badge is red when any metric is red", () => {
    const m = cleanMetrics();
    m.coverage = { lines_pct: 7, files: {} };
    const q = JSON.parse(renderBadges(m)["quality.json"]!) as BadgeJson;
    expect(q.color).toBe("red");
  });

  it("produces all 4 badge files", () => {
    const badges = renderBadges(cleanMetrics());
    expect(Object.keys(badges).sort()).toEqual(["coverage.json", "duplication.json", "lint.json", "quality.json"]);
  });
});
