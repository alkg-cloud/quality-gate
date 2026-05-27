import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ValidationError,
  validateAdapterOutput,
  validateBaseline,
  validateConfig,
} from "../../src/validator.js";

function tmpFile(name: string, data: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "qg-test-"));
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(data, null, 2));
  return path;
}

describe("validator", () => {
  it("accepts valid coverage", () => {
    const p = tmpFile("coverage.json", {
      lines_pct: 80,
      files: [{ path: "a.ts", lines_pct: 100 }],
    });
    expect(() => validateAdapterOutput("coverage", p)).not.toThrow();
  });

  it("accepts skipped coverage", () => {
    const p = tmpFile("coverage.json", { _skipped: "no tool" });
    expect(() => validateAdapterOutput("coverage", p)).not.toThrow();
  });

  it("rejects coverage missing files field", () => {
    const p = tmpFile("coverage.json", { lines_pct: 80 });
    expect(() => validateAdapterOutput("coverage", p)).toThrowError(/required/);
  });

  it("rejects unknown metric name", () => {
    const p = tmpFile("x.json", { any: 1 });
    expect(() => validateAdapterOutput("unknown_metric" as never, p)).toThrowError(/unknown/i);
  });

  it("accepts a valid config", () => {
    const cfg = {
      schema_version: 1,
      default_branch: "main",
      thresholds: { MAX_FILE_LINES: 300, MIN_NEW_FILE_COVERAGE: 60 },
      ratchet: { strict: true, epsilon: 0 },
      metrics: {
        coverage: { enabled: true },
        duplication: { enabled: true },
        lint: { enabled: true },
        file_size: { enabled: true },
        security: { enabled: true, block_severities: ["critical"], warn_severities: ["high"] },
      },
      adapter: { command: "./a.sh", name: "stub", version: "0.1" },
    };
    expect(() => validateConfig(tmpFile("c.json", cfg))).not.toThrow();
  });

  it("rejects strict=true with epsilon>0", () => {
    const cfg = {
      schema_version: 1,
      default_branch: "main",
      thresholds: { MAX_FILE_LINES: 300, MIN_NEW_FILE_COVERAGE: 60 },
      ratchet: { strict: true, epsilon: 0.5 },
      metrics: {
        coverage: { enabled: true },
        duplication: { enabled: true },
        lint: { enabled: true },
        file_size: { enabled: true },
        security: { enabled: true, block_severities: ["critical"], warn_severities: ["high"] },
      },
      adapter: { command: "./a.sh", name: "s", version: "0.1" },
    };
    expect(() => validateConfig(tmpFile("c.json", cfg))).toThrow(ValidationError);
  });
});
