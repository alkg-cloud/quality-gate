import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Metrics, Coverage, Duplication, Lint, FileSize, Security, Meta } from "./types.js";
import { validateAdapterOutput, type MetricName } from "./validator.js";

const REQUIRED: readonly MetricName[] = [
  "coverage", "duplication", "lint", "file_size", "security", "_meta",
];

function loadFile<T>(dir: string, name: string): T {
  const path = join(dir, `${name}.json`);
  if (!existsSync(path)) {
    throw new Error(`missing required adapter output: ${name}.json`);
  }
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function isSkipped(data: unknown): data is { _skipped: string } {
  return typeof data === "object" && data !== null && "_skipped" in data;
}

function normalizeCoverage(data: unknown): Coverage {
  if (isSkipped(data)) return data;
  const d = data as { lines_pct: number; files: { path: string; lines_pct: number }[] };
  const files: Record<string, number> = {};
  for (const f of d.files) files[f.path] = f.lines_pct;
  return { lines_pct: d.lines_pct, files };
}

function normalizeLint(data: unknown): Lint {
  if (isSkipped(data)) return data;
  const d = data as { total: number; by_file: { path: string; count: number }[] };
  const by_file: Record<string, number> = {};
  for (const f of d.by_file) by_file[f.path] = f.count;
  return { total: d.total, by_file };
}

function normalizeFileSize(data: unknown): FileSize {
  if (isSkipped(data)) return data;
  const d = data as { max_lines: number; violations: { path: string; lines: number }[] };
  const violations: Record<string, number> = {};
  for (const f of d.violations) violations[f.path] = f.lines;
  return { max_lines: d.max_lines, violations };
}

export function collect(outputDir: string): Metrics {
  const raw: Record<string, unknown> = {};
  for (const name of REQUIRED) raw[name] = loadFile(outputDir, name);
  for (const name of REQUIRED) validateAdapterOutput(name, join(outputDir, `${name}.json`));

  return {
    coverage:    normalizeCoverage(raw["coverage"]),
    duplication: raw["duplication"] as Duplication,
    lint:        normalizeLint(raw["lint"]),
    file_size:   normalizeFileSize(raw["file_size"]),
    security:    raw["security"] as Security,
    _meta:       raw["_meta"] as Meta,
  };
}
