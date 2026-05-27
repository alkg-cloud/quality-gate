import type {
  Baseline,
  ComparatorReport,
  Metrics,
  QGConfig,
  Regression,
  Severity,
  Warning,
} from "./types.js";

function isSkipped(x: unknown): x is { _skipped: string } {
  return typeof x === "object" && x !== null && "_skipped" in x;
}

function globalRegression(
  name: string,
  baselineVal: number,
  prVal: number,
  direction: "higher_better" | "lower_better",
  epsilon: number,
): Regression | null {
  const worse =
    direction === "higher_better"
      ? prVal < baselineVal - epsilon
      : prVal > baselineVal + epsilon;
  if (!worse) return null;
  return {
    metric: name,
    scope: "global",
    baseline: baselineVal,
    actual: prVal,
    delta: prVal - baselineVal,
  };
}

function perFileCountRegressions(
  metricName: string,
  baselineMap: Record<string, number>,
  prMap: Record<string, number>,
): Regression[] {
  const out: Regression[] = [];
  for (const [path, count] of Object.entries(prMap)) {
    if (!(path in baselineMap)) {
      out.push({
        metric: metricName,
        scope: "new_file",
        file: path,
        baseline: 0,
        actual: count,
        delta: count,
      });
    } else if (count > baselineMap[path]!) {
      out.push({
        metric: metricName,
        scope: "file",
        file: path,
        baseline: baselineMap[path]!,
        actual: count,
        delta: count - baselineMap[path]!,
      });
    }
  }
  return out;
}

function perFileSizeRegressions(
  maxLines: number,
  baselineViolations: Record<string, number>,
  prViolations: Record<string, number>,
): Regression[] {
  const out: Regression[] = [];
  for (const [path, lines] of Object.entries(prViolations)) {
    if (!(path in baselineViolations)) {
      out.push({
        metric: "file_size",
        scope: "new_file",
        file: path,
        baseline: 0,
        actual: lines,
        required: maxLines,
        delta: lines,
      });
    } else if (lines > baselineViolations[path]!) {
      out.push({
        metric: "file_size",
        scope: "file",
        file: path,
        baseline: baselineViolations[path]!,
        actual: lines,
        required: maxLines,
        delta: lines - baselineViolations[path]!,
      });
    }
  }
  return out;
}

function newFileCoverageFloor(
  floor: number,
  baselineFiles: Record<string, number>,
  prFiles: Record<string, number>,
): Regression[] {
  const out: Regression[] = [];
  for (const [path, pct] of Object.entries(prFiles)) {
    if (!(path in baselineFiles) && pct < floor) {
      out.push({
        metric: "coverage",
        scope: "new_file_floor",
        file: path,
        actual: pct,
        required: floor,
        delta: pct - floor,
      });
    }
  }
  return out;
}

function checkSecurity(
  metric: { critical: number; high: number; moderate: number; low: number },
  baselineSec: Partial<Record<Severity, number>> | undefined,
  cfg: QGConfig,
): { regressions: Regression[]; warnings: Warning[] } {
  const regressions: Regression[] = [];
  const warnings: Warning[] = [];

  for (const sev of cfg.metrics.security.block_severities) {
    const n = metric[sev];
    if (n > 0) {
      regressions.push({
        metric: "security",
        scope: (sev === "critical" ? "critical_blocker" : `${sev}_blocker`) as Regression["scope"],
        actual: n,
        baseline: baselineSec?.[sev] ?? 0,
        delta: n - (baselineSec?.[sev] ?? 0),
      });
    }
  }

  for (const sev of cfg.metrics.security.warn_severities) {
    const n = metric[sev];
    if (n > 0) {
      warnings.push({
        metric: "security",
        severity: sev,
        count: n,
        delta: n - (baselineSec?.[sev] ?? 0),
      });
    }
  }

  return { regressions, warnings };
}

export function compare(
  pr: Metrics,
  baseline: Baseline | null,
  cfg: QGConfig,
): ComparatorReport {
  const regressions: Regression[] = [];
  const warnings: Warning[] = [];
  const passing: string[] = [];

  // Bootstrap mode: no baseline — only enforce security blockers
  if (baseline === null) {
    if (!isSkipped(pr.security) && cfg.metrics.security.enabled) {
      const sec = pr.security as { critical: number; high: number; moderate: number; low: number };
      const { regressions: r, warnings: w } = checkSecurity(sec, undefined, cfg);
      regressions.push(...r);
      warnings.push(...w);
    }
    return {
      gate_passed: regressions.length === 0,
      regressions,
      warnings,
      passing: [],
      bootstrap: true,
    };
  }

  const bl = baseline.metrics;
  const epsilon = cfg.ratchet.strict ? 0 : cfg.ratchet.epsilon;

  // Coverage global
  if (cfg.metrics.coverage.enabled && !isSkipped(pr.coverage) && !isSkipped(bl.coverage)) {
    const blCov = bl.coverage as { lines_pct: number; files: Record<string, number> };
    const prCov = pr.coverage as { lines_pct: number; files: Record<string, number> };
    const reg = globalRegression("coverage", blCov.lines_pct, prCov.lines_pct, "higher_better", epsilon);
    if (reg) regressions.push(reg);
    else passing.push("coverage_global");
  }

  // Duplication global
  if (cfg.metrics.duplication.enabled && !isSkipped(pr.duplication) && !isSkipped(bl.duplication)) {
    const blDup = bl.duplication as { pct: number };
    const prDup = pr.duplication as { pct: number };
    const reg = globalRegression("duplication", blDup.pct, prDup.pct, "lower_better", epsilon);
    if (reg) regressions.push(reg);
    else passing.push("duplication");
  }

  // Lint global + per-file
  if (cfg.metrics.lint.enabled && !isSkipped(pr.lint) && !isSkipped(bl.lint)) {
    const blLint = bl.lint as { total: number; by_file: Record<string, number> };
    const prLint = pr.lint as { total: number; by_file: Record<string, number> };

    const globalReg = globalRegression("lint", blLint.total, prLint.total, "lower_better", epsilon);
    if (globalReg) {
      // Match Python: cast delta/baseline/actual to int
      globalReg.delta = Math.round(globalReg.delta!);
      globalReg.baseline = Math.round(globalReg.baseline!);
      globalReg.actual = Math.round(globalReg.actual!);
      regressions.push(globalReg);
    } else {
      passing.push("lint_global");
    }

    regressions.push(...perFileCountRegressions("lint", blLint.by_file, prLint.by_file));
  }

  // File size per-file
  if (cfg.metrics.file_size.enabled && !isSkipped(pr.file_size) && !isSkipped(bl.file_size)) {
    const blFs = bl.file_size as { max_lines: number; violations: Record<string, number> };
    const prFs = pr.file_size as { max_lines: number; violations: Record<string, number> };
    regressions.push(
      ...perFileSizeRegressions(cfg.thresholds.MAX_FILE_LINES, blFs.violations, prFs.violations),
    );
  }

  // Coverage new-file floor
  if (cfg.metrics.coverage.enabled && !isSkipped(pr.coverage) && !isSkipped(bl.coverage)) {
    const blCov = bl.coverage as { files: Record<string, number> };
    const prCov = pr.coverage as { files: Record<string, number> };
    regressions.push(
      ...newFileCoverageFloor(cfg.thresholds.MIN_NEW_FILE_COVERAGE, blCov.files, prCov.files),
    );
  }

  // Security
  if (cfg.metrics.security.enabled && !isSkipped(pr.security)) {
    const sec = pr.security as { critical: number; high: number; moderate: number; low: number };
    const blSec = !isSkipped(bl.security)
      ? (bl.security as Record<Severity, number>)
      : undefined;
    const { regressions: r, warnings: w } = checkSecurity(sec, blSec, cfg);
    regressions.push(...r);
    warnings.push(...w);
    if (!regressions.some((reg) => reg.metric === "security")) {
      passing.push("security_critical");
    }
  }

  return {
    gate_passed: regressions.length === 0,
    regressions,
    warnings,
    passing,
    bootstrap: false,
  };
}
