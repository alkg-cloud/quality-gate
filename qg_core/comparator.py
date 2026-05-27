"""Comparator: applies ratchet rules to metrics vs baseline. Produces report dict."""
from __future__ import annotations

from typing import Any, TypedDict


class Regression(TypedDict, total=False):
    metric: str
    scope: str
    file: str
    baseline: float
    actual: float
    required: float
    delta: float
    rules: list[str]


def _is_skipped(metric_data: dict) -> bool:
    return isinstance(metric_data, dict) and "_skipped" in metric_data


def _global_regression(name: str, baseline_val: float, pr_val: float,
                       direction: str, epsilon: float) -> Regression | None:
    """direction: 'higher_better' (coverage) or 'lower_better' (duplication, etc.)."""
    if direction == "higher_better":
        worse = pr_val < baseline_val - epsilon
    else:
        worse = pr_val > baseline_val + epsilon
    if not worse:
        return None
    return {
        "metric": name,
        "scope": "global",
        "baseline": baseline_val,
        "actual": pr_val,
        "delta": pr_val - baseline_val,
    }


def _per_file_regressions_count(metric_name: str,
                                baseline_map: dict[str, int],
                                pr_map: dict[str, int]) -> list[Regression]:
    out: list[Regression] = []
    for path, count in pr_map.items():
        if path not in baseline_map:
            out.append({"metric": metric_name, "scope": "new_file", "file": path,
                        "baseline": 0, "actual": count, "delta": count})
        elif count > baseline_map[path]:
            out.append({"metric": metric_name, "scope": "file", "file": path,
                        "baseline": baseline_map[path], "actual": count,
                        "delta": count - baseline_map[path]})
    return out


def _per_file_size_regressions(max_lines: int,
                               baseline_violations: dict[str, int],
                               pr_violations: dict[str, int]) -> list[Regression]:
    out: list[Regression] = []
    for path, lines in pr_violations.items():
        if path not in baseline_violations:
            out.append({"metric": "file_size", "scope": "new_file", "file": path,
                        "baseline": 0, "actual": lines, "required": max_lines,
                        "delta": lines})
        elif lines > baseline_violations[path]:
            out.append({"metric": "file_size", "scope": "file", "file": path,
                        "baseline": baseline_violations[path], "actual": lines,
                        "required": max_lines, "delta": lines - baseline_violations[path]})
    return out


def _new_file_coverage_floor(floor: float,
                             baseline_files: dict[str, float],
                             pr_files: dict[str, float]) -> list[Regression]:
    return [
        {"metric": "coverage", "scope": "new_file_floor", "file": path,
         "actual": pct, "required": floor, "delta": pct - floor}
        for path, pct in pr_files.items()
        if path not in baseline_files and pct < floor
    ]


def compare(pr_metrics: dict, baseline: dict, config: dict) -> dict:
    bl = baseline["metrics"]
    regressions: list[Regression] = []
    warnings: list[dict[str, Any]] = []
    passing: list[str] = []

    epsilon = config["ratchet"]["epsilon"] if not config["ratchet"]["strict"] else 0.0

    # Coverage global
    if config["metrics"]["coverage"]["enabled"] and not _is_skipped(pr_metrics["coverage"]) and not _is_skipped(bl["coverage"]):
        reg = _global_regression("coverage", bl["coverage"]["lines_pct"], pr_metrics["coverage"]["lines_pct"], "higher_better", epsilon)
        if reg: regressions.append(reg)
        else:   passing.append("coverage_global")

    # Duplication global
    if config["metrics"]["duplication"]["enabled"] and not _is_skipped(pr_metrics["duplication"]) and not _is_skipped(bl["duplication"]):
        reg = _global_regression("duplication", bl["duplication"]["pct"], pr_metrics["duplication"]["pct"], "lower_better", epsilon)
        if reg: regressions.append(reg)
        else:   passing.append("duplication")

    # Lint global (per-file added in Task 6)
    if config["metrics"]["lint"]["enabled"] and not _is_skipped(pr_metrics["lint"]) and not _is_skipped(bl["lint"]):
        reg = _global_regression("lint", float(bl["lint"]["total"]), float(pr_metrics["lint"]["total"]), "lower_better", epsilon)
        if reg:
            reg["delta"] = int(reg["delta"])
            reg["baseline"] = int(reg["baseline"])
            reg["actual"] = int(reg["actual"])
            regressions.append(reg)
        else:
            passing.append("lint_global")

    # Lint per-file
    if config["metrics"]["lint"]["enabled"] and not _is_skipped(pr_metrics["lint"]) and not _is_skipped(bl["lint"]):
        regressions.extend(_per_file_regressions_count(
            "lint", bl["lint"]["by_file"], pr_metrics["lint"]["by_file"]))

    # File size per-file
    if config["metrics"]["file_size"]["enabled"] and not _is_skipped(pr_metrics["file_size"]) and not _is_skipped(bl["file_size"]):
        regressions.extend(_per_file_size_regressions(
            config["thresholds"]["MAX_FILE_LINES"],
            bl["file_size"]["violations"],
            pr_metrics["file_size"]["violations"]))

    # Coverage new-file floor
    if config["metrics"]["coverage"]["enabled"] and not _is_skipped(pr_metrics["coverage"]) and not _is_skipped(bl["coverage"]):
        regressions.extend(_new_file_coverage_floor(
            config["thresholds"]["MIN_NEW_FILE_COVERAGE"],
            bl["coverage"]["files"],
            pr_metrics["coverage"]["files"]))

    # Security: critical is absolute blocker; high is warning
    if config["metrics"]["security"]["enabled"] and not _is_skipped(pr_metrics["security"]):
        sec = pr_metrics["security"]
        for sev in config["metrics"]["security"]["block_severities"]:
            if sec.get(sev, 0) > 0:
                regressions.append({
                    "metric": "security",
                    "scope": "critical_blocker" if sev == "critical" else f"{sev}_blocker",
                    "actual": sec[sev],
                    "baseline": bl["security"].get(sev, 0),
                    "delta": sec[sev] - bl["security"].get(sev, 0),
                })
        for sev in config["metrics"]["security"]["warn_severities"]:
            n = sec.get(sev, 0)
            if n > 0:
                warnings.append({"metric": "security", "severity": sev, "count": n,
                                 "delta": n - bl["security"].get(sev, 0)})
        if not any(r["metric"] == "security" for r in regressions):
            passing.append("security_critical")

    return {
        "gate_passed": len(regressions) == 0,
        "regressions": regressions,
        "warnings": warnings,
        "passing": passing,
    }
