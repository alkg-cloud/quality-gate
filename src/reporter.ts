import type { Baseline, ComparatorReport, Metrics, Regression } from "./types.js";

const MARKER = "<!-- quality-gate-marker:v1 -->";

function shortSha(sha: string): string {
  return sha.slice(0, 6);
}

function fmtDelta(d: number, unit = ""): string {
  const sign = d > 0 ? "+" : "";
  return `${sign}${d}${unit}`;
}

function row(name: string, baseline: string, pr: string, delta: string, status: string): string {
  return `| ${name.padEnd(13)} | ${baseline.padEnd(9)} | ${pr.padEnd(7)} | ${delta.padEnd(7)} | ${status.padEnd(7)} |`;
}

function buildTable(pr: Metrics, baseline: Baseline | null, report: ComparatorReport): string {
  const bl = baseline?.metrics;
  const failed = new Set(report.regressions.map(r => r.metric));
  const rows: string[] = [
    row("Metric", "Baseline", "PR", "Δ", "Status"),
    "|---------------|----------|---------|---------|---------|",
  ];

  if ("lines_pct" in pr.coverage) {
    const b = bl && "lines_pct" in bl.coverage ? bl.coverage.lines_pct : null;
    const p = pr.coverage.lines_pct;
    const d = b === null ? "—" : `${(p - b).toFixed(2)}pp`;
    rows.push(row("Coverage", b !== null ? `${b}%` : "—", `${p}%`, d, failed.has("coverage") ? "❌" : "✅"));
  }
  if ("pct" in pr.duplication) {
    const b = bl && "pct" in bl.duplication ? bl.duplication.pct : null;
    const p = pr.duplication.pct;
    const d = b === null ? "—" : `${(p - b).toFixed(2)}pp`;
    rows.push(row("Duplication", b !== null ? `${b}%` : "—", `${p}%`, d, failed.has("duplication") ? "❌" : "✅"));
  }
  if ("total" in pr.lint) {
    const b = bl && "total" in bl.lint ? bl.lint.total : null;
    const p = pr.lint.total;
    const d = b === null ? "—" : fmtDelta(p - b);
    rows.push(row("Lint (total)", b !== null ? `${b}` : "—", `${p}`, d, failed.has("lint") ? "❌" : "✅"));
  }
  if ("violations" in pr.file_size) {
    const b = bl && "violations" in bl.file_size ? Object.keys(bl.file_size.violations).length : null;
    const p = Object.keys(pr.file_size.violations).length;
    const d = b === null ? "—" : fmtDelta(p - b);
    rows.push(row("Oversized", b !== null ? `${b}` : "—", `${p}`, d, failed.has("file_size") ? "❌" : "✅"));
  }
  if ("critical" in pr.security) {
    const b = bl && "critical" in bl.security ? bl.security.critical : null;
    rows.push(row("Security", b !== null ? `${b} crit` : "—", `${pr.security.critical} crit`, "—",
      report.regressions.some(r => r.metric === "security") ? "❌" : "✅"));
  }
  return rows.join("\n");
}

function regressionSections(report: ComparatorReport): string {
  if (report.regressions.length === 0) return "";
  const parts = ["### Regressions\n"];
  const byMetric = new Map<string, Regression[]>();
  for (const r of report.regressions) {
    if (!byMetric.has(r.metric)) byMetric.set(r.metric, []);
    byMetric.get(r.metric)!.push(r);
  }
  for (const metric of Array.from(byMetric.keys()).sort()) {
    const items = byMetric.get(metric)!;
    const lines = [`**${metric}** — ${items.length} issue(s):`];
    const sorted = [...items].sort((a, b) =>
      (a.scope ?? "").localeCompare(b.scope ?? "") || (a.file ?? "").localeCompare(b.file ?? ""),
    );
    for (const it of sorted) {
      const filePart = it.file ? ` \`${it.file}\`` : "";
      let extra = "";
      if (it.actual !== undefined && it.baseline !== undefined) {
        extra = ` ${it.baseline} → ${it.actual} (${fmtDelta(it.delta ?? 0)})`;
      } else if (it.actual !== undefined && it.required !== undefined) {
        extra = ` ${it.actual} (required: ${it.required})`;
      }
      lines.push(`- [${it.scope ?? "global"}]${filePart}${extra}`);
    }
    parts.push(lines.join("\n"), "");
  }
  return parts.join("\n");
}

function warningSection(report: ComparatorReport): string {
  if (report.warnings.length === 0) return "";
  const lines = ["### Warnings (non-blocking)\n"];
  for (const w of report.warnings) {
    lines.push(`- **${w.metric}**: ${w.count} \`${w.severity}\` (Δ ${fmtDelta(w.delta ?? 0)})`);
  }
  return lines.join("\n") + "\n";
}

export function renderPrComment(pr: Metrics, baseline: Baseline | null, report: ComparatorReport): string {
  const adapter = `${pr._meta.adapter}@${pr._meta.adapter_version}`;
  const tools = pr._meta.tools.join(", ");

  let header: string;
  let baselineLine: string;
  if (report.bootstrap) {
    header = "⚙️ BOOTSTRAP";
    baselineLine = "> Baseline: _pending — will be created on first merge to default branch._";
  } else {
    header = report.gate_passed ? "✅ PASSED" : "❌ FAILED";
    baselineLine = baseline ? `> Baseline: \`${shortSha(baseline.commit_sha)}\` (${baseline.updated_at.slice(0, 10)})` : "";
  }

  const parts: string[] = [
    MARKER,
    `## 🚦 Quality Gate — ${header}`,
    "",
    `> Adapter: \`${adapter}\` · Tools: ${tools}`,
  ];
  if (baselineLine) parts.push(baselineLine);
  parts.push("", buildTable(pr, baseline, report), "");
  if (report.bootstrap) {
    parts.push("⚙️ **Bootstrap pending** — baseline will be created on first merge to default branch. Critical security issues still block.\n");
  }
  parts.push(regressionSections(report));
  parts.push(warningSection(report));
  return parts.filter(p => p !== null).join("\n").replace(/\n+$/, "") + "\n";
}

const COVERAGE_THRESHOLDS: Array<[number, string]> = [[80, "brightgreen"], [60, "yellowgreen"], [40, "yellow"], [20, "orange"], [0, "red"]];
const DUPLICATION_THRESHOLDS: Array<[number, string]> = [[2, "brightgreen"], [5, "yellow"], [10, "orange"], [1000, "red"]];
const LINT_THRESHOLDS: Array<[number, string]> = [[0, "brightgreen"], [10, "yellow"], [50, "orange"], [1_000_000, "red"]];

function coverageColor(pct: number): string {
  for (const [b, c] of COVERAGE_THRESHOLDS) if (pct >= b) return c;
  return "red";
}

function duplicationColor(pct: number): string {
  for (const [b, c] of DUPLICATION_THRESHOLDS) if (pct <= b) return c;
  return "red";
}

function lintColor(total: number): string {
  for (const [b, c] of LINT_THRESHOLDS) if (total <= b) return c;
  return "red";
}

function shields(label: string, message: string, color: string): string {
  return JSON.stringify({ schemaVersion: 1, label, message, color }, null, 2) + "\n";
}

export function renderBadges(pr: Metrics): Record<string, string> {
  if (!("lines_pct" in pr.coverage) || !("pct" in pr.duplication) || !("total" in pr.lint)) {
    throw new Error("renderBadges requires non-skipped coverage, duplication, and lint metrics");
  }
  const covColor = coverageColor(pr.coverage.lines_pct);
  const dupColor = duplicationColor(pr.duplication.pct);
  const lintC = lintColor(pr.lint.total);
  const rank: Record<string, number> = { brightgreen: 0, yellowgreen: 1, yellow: 2, orange: 3, red: 4 };
  const composite = [covColor, dupColor, lintC].reduce((a, b) => ((rank[a] ?? 4) >= (rank[b] ?? 4) ? a : b));
  return {
    "coverage.json":    shields("coverage", `${pr.coverage.lines_pct}%`, covColor),
    "duplication.json": shields("duplication", `${pr.duplication.pct}%`, dupColor),
    "lint.json":        shields("lint", String(pr.lint.total), lintC),
    "quality.json":     shields("quality", composite === "brightgreen" ? "passing" : "issues", composite),
  };
}
