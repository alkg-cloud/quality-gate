import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collect } from "../../src/collector.js";
import { ValidationError } from "../../src/validator.js";

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), "qg-collect-"));
}

function write(dir: string, name: string, data: unknown): void {
  writeFileSync(join(dir, name), JSON.stringify(data, null, 2));
}

function scaffold(dir: string): void {
  write(dir, "coverage.json", {
    lines_pct: 80,
    files: [{ path: "a.ts", lines_pct: 100 }, { path: "b.ts", lines_pct: 60 }],
  });
  write(dir, "duplication.json", { pct: 1.5, clones: 3 });
  write(dir, "lint.json", { total: 7, by_file: [{ path: "a.ts", count: 7 }] });
  write(dir, "file_size.json", { max_lines: 300, violations: [{ path: "big.ts", lines: 999 }] });
  write(dir, "security.json", { critical: 0, high: 1, moderate: 2, low: 3 });
  write(dir, "_meta.json", { adapter: "stub", adapter_version: "0.1", tools: ["fake"] });
}

describe("collector", () => {
  let dir: string;
  beforeEach(() => { dir = makeDir(); });

  it("normalizes arrays to maps", () => {
    scaffold(dir);
    const m = collect(dir);
    expect(m.coverage).toEqual({ lines_pct: 80, files: { "a.ts": 100, "b.ts": 60 } });
    expect(m.lint).toEqual({ total: 7, by_file: { "a.ts": 7 } });
    expect(m.file_size).toEqual({ max_lines: 300, violations: { "big.ts": 999 } });
  });

  it("preserves global values", () => {
    scaffold(dir);
    const m = collect(dir);
    expect((m.coverage as { lines_pct: number }).lines_pct).toBe(80);
    expect((m.duplication as { pct: number }).pct).toBe(1.5);
    expect((m.security as { critical: number; high: number }).critical).toBe(0);
    expect((m.security as { critical: number; high: number }).high).toBe(1);
  });

  it("preserves skipped", () => {
    scaffold(dir);
    write(dir, "duplication.json", { _skipped: "no tool" });
    const m = collect(dir);
    expect(m.duplication).toEqual({ _skipped: "no tool" });
  });

  it("throws when required file is missing", () => {
    scaffold(dir);
    unlinkSync(join(dir, "coverage.json"));
    expect(() => collect(dir)).toThrowError(/coverage\.json/);
  });

  it("throws ValidationError on invalid JSON shape", () => {
    scaffold(dir);
    writeFileSync(join(dir, "coverage.json"), JSON.stringify({ lines_pct: "not-a-number" }));
    expect(() => collect(dir)).toThrowError(ValidationError);
  });
});
