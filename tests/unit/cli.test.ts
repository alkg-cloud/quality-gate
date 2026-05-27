import { describe, expect, it, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(process.cwd(), "src/cli.ts");

function tsx(args: string[]): { stdout: string; code: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", CLI, ...args], { encoding: "utf-8" });
    return { stdout, code: 0 };
  } catch (e) {
    const err = e as { stdout?: Buffer; status?: number };
    return { stdout: (err.stdout ?? Buffer.from("")).toString(), code: err.status ?? 1 };
  }
}

function write(p: string, data: unknown): void {
  writeFileSync(p, JSON.stringify(data, null, 2));
}

function configData(): unknown {
  return {
    schema_version: 1, default_branch: "main",
    thresholds: { MAX_FILE_LINES: 300, MIN_NEW_FILE_COVERAGE: 60 },
    ratchet: { strict: true, epsilon: 0 },
    metrics: {
      coverage: { enabled: true }, duplication: { enabled: true },
      lint: { enabled: true }, file_size: { enabled: true },
      security: { enabled: true, block_severities: ["critical"], warn_severities: ["high"] },
    },
    adapter: { command: "./a.sh", name: "s", version: "0.1" },
  };
}

function scaffoldOutputs(dir: string): void {
  write(join(dir, "coverage.json"),    { lines_pct: 80, files: [{ path: "a.ts", lines_pct: 100 }] });
  write(join(dir, "duplication.json"), { pct: 1 });
  write(join(dir, "lint.json"),        { total: 0, by_file: [] });
  write(join(dir, "file_size.json"),   { max_lines: 300, violations: [] });
  write(join(dir, "security.json"),    { critical: 0, high: 0, moderate: 0, low: 0 });
  write(join(dir, "_meta.json"),       { adapter: "stub", adapter_version: "0.1", tools: [] });
}

describe("cli", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "qg-cli-")); });

  it("collect writes metrics.json", () => {
    scaffoldOutputs(dir);
    const metricsPath = join(dir, "metrics.json");
    const { code } = tsx(["collect", "--input", dir, "--output", metricsPath]);
    expect(code).toBe(0);
    const data = JSON.parse(readFileSync(metricsPath, "utf-8"));
    expect(data.coverage.lines_pct).toBe(80);
  });

  it("compare bootstrap mode passes when baseline=NONE and clean", () => {
    scaffoldOutputs(dir);
    const metricsPath = join(dir, "metrics.json");
    const configPath  = join(dir, "config.json");
    const reportPath  = join(dir, "report.json");
    write(configPath, configData());
    tsx(["collect", "--input", dir, "--output", metricsPath]);
    const r = tsx(["compare", "--metrics", metricsPath, "--baseline", "NONE", "--config", configPath, "--output", reportPath]);
    expect(r.code).toBe(0);
    const report = JSON.parse(readFileSync(reportPath, "utf-8"));
    expect(report.bootstrap).toBe(true);
    expect(report.gate_passed).toBe(true);
  });
});
