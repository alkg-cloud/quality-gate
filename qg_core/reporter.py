"""Reporter: comparator-report.json + metrics + baseline -> markdown for PR + summary."""
from __future__ import annotations

from typing import Any

MARKER = "<!-- quality-gate-marker:v1 -->"


def _short_sha(sha: str) -> str:
    return sha[:6]


def _fmt_delta(delta: float | int, unit: str = "") -> str:
    sign = "+" if delta > 0 else ""
    return f"{sign}{delta}{unit}"


def _table_row(name: str, baseline_val: str, pr_val: str, delta: str, status: str) -> str:
    return f"| {name:<14}| {baseline_val:<9}| {pr_val:<8}| {delta:<7}| {status:<7}|"


def _build_table(pr: dict, baseline: dict | None, report: dict) -> str:
    bl = baseline["metrics"] if baseline else {}
    failed_metrics = {r["metric"] for r in report["regressions"]}

    rows: list[str] = []
    rows.append(_table_row("Metric", "Baseline", "PR", "Δ", "Status"))
    rows.append("|---------------|----------|--------|--------|--------|")

    if "coverage" in pr and "lines_pct" in pr["coverage"]:
        b = bl.get("coverage", {}).get("lines_pct") if bl else None
        p = pr["coverage"]["lines_pct"]
        d = "—" if b is None else f"{p - b:+.2f}pp"
        rows.append(_table_row("Coverage", f"{b}%" if b is not None else "—", f"{p}%", d,
                               "❌" if "coverage" in failed_metrics else "✅"))

    if "duplication" in pr and "pct" in pr["duplication"]:
        b = bl.get("duplication", {}).get("pct") if bl else None
        p = pr["duplication"]["pct"]
        d = "—" if b is None else f"{p - b:+.2f}pp"
        rows.append(_table_row("Duplication", f"{b}%" if b is not None else "—", f"{p}%", d,
                               "❌" if "duplication" in failed_metrics else "✅"))

    if "lint" in pr and "total" in pr["lint"]:
        b = bl.get("lint", {}).get("total") if bl else None
        p = pr["lint"]["total"]
        d = "—" if b is None else _fmt_delta(p - b)
        rows.append(_table_row("Lint (total)", str(b) if b is not None else "—", str(p), d,
                               "❌" if "lint" in failed_metrics else "✅"))

    if "file_size" in pr and "violations" in pr["file_size"]:
        b = len(bl.get("file_size", {}).get("violations", {})) if bl else None
        p = len(pr["file_size"]["violations"])
        d = "—" if b is None else _fmt_delta(p - b)
        rows.append(_table_row("Oversized", str(b) if b is not None else "—", str(p), d,
                               "❌" if "file_size" in failed_metrics else "✅"))

    if "security" in pr and "critical" in pr["security"]:
        p = pr["security"]["critical"]
        b = bl.get("security", {}).get("critical") if bl else None
        rows.append(_table_row("Security", f"{b} crit" if b is not None else "—",
                               f"{p} crit", "—",
                               "❌" if any(r["metric"] == "security" for r in report["regressions"]) else "✅"))
    return "\n".join(rows)


def _regression_sections(report: dict) -> str:
    if not report["regressions"]:
        return ""
    parts = ["### Regressions\n"]
    by_metric: dict[str, list[dict]] = {}
    for r in report["regressions"]:
        by_metric.setdefault(r["metric"], []).append(r)
    for metric in sorted(by_metric):
        items = by_metric[metric]
        lines = [f"**{metric}** — {len(items)} issue(s):"]
        for it in sorted(items, key=lambda x: (x.get("scope", ""), x.get("file", ""))):
            file_part = f" `{it['file']}`" if "file" in it else ""
            extra = ""
            if "actual" in it and "baseline" in it:
                extra = f" {it['baseline']} → {it['actual']} ({_fmt_delta(it.get('delta', 0))})"
            elif "actual" in it and "required" in it:
                extra = f" {it['actual']} (required: {it['required']})"
            lines.append(f"- [{it.get('scope', 'global')}]{file_part}{extra}")
        parts.append("\n".join(lines))
        parts.append("")
    return "\n".join(parts)


def _warning_section(report: dict) -> str:
    if not report["warnings"]:
        return ""
    lines = ["### Warnings (non-blocking)\n"]
    for w in report["warnings"]:
        lines.append(f"- **{w['metric']}**: {w['count']} `{w['severity']}` (Δ {_fmt_delta(w.get('delta', 0))})")
    return "\n".join(lines) + "\n"


def render_pr_comment(pr_metrics: dict, baseline: dict | None, report: dict) -> str:
    meta = pr_metrics.get("_meta", {})
    adapter = f"{meta.get('adapter', '?')}@{meta.get('adapter_version', '?')}"
    tools = ", ".join(meta.get("tools", []))

    if report.get("bootstrap"):
        header = "⚙️ BOOTSTRAP"
        baseline_line = "> Baseline: _pending — will be created on first merge to default branch._"
    else:
        header = "✅ PASSED" if report["gate_passed"] else "❌ FAILED"
        if baseline is not None:
            baseline_line = f"> Baseline: `{_short_sha(baseline['commit_sha'])}` ({baseline['updated_at'][:10]})"
        else:
            baseline_line = ""

    parts = [
        MARKER,
        f"## 🚦 Quality Gate — {header}",
        "",
        f"> Adapter: `{adapter}` · Tools: {tools}",
        baseline_line,
        "",
        _build_table(pr_metrics, baseline, report),
        "",
    ]
    if report.get("bootstrap"):
        parts.append("⚙️ **Bootstrap pending** — baseline will be created on first merge to default branch. "
                     "Critical security issues still block.\n")
    parts.append(_regression_sections(report))
    parts.append(_warning_section(report))
    return "\n".join(p for p in parts if p is not None).rstrip() + "\n"


def _color_for_threshold(value: float, thresholds: list[tuple[float, str]]) -> str:
    """thresholds sorted best→worst, each (boundary, color). First match wins (boundary inclusive)."""
    for boundary, color in thresholds:
        if value >= boundary if thresholds[0][1] == "brightgreen" else value <= boundary:
            return color
    return thresholds[-1][1]


_COVERAGE_THRESHOLDS: list[tuple[float, str]] = [
    (80, "brightgreen"), (60, "yellowgreen"), (40, "yellow"), (20, "orange"), (0, "red"),
]
_DUPLICATION_THRESHOLDS: list[tuple[float, str]] = [
    (2, "brightgreen"), (5, "yellow"), (10, "orange"), (1000, "red"),
]
_LINT_THRESHOLDS: list[tuple[int, str]] = [
    (0, "brightgreen"), (10, "yellow"), (50, "orange"), (1_000_000, "red"),
]


def _coverage_color(pct: float) -> str:
    for boundary, color in _COVERAGE_THRESHOLDS:
        if pct >= boundary:
            return color
    return "red"


def _duplication_color(pct: float) -> str:
    for boundary, color in _DUPLICATION_THRESHOLDS:
        if pct <= boundary:
            return color
    return "red"


def _lint_color(total: int) -> str:
    for boundary, color in _LINT_THRESHOLDS:
        if total <= boundary:
            return color
    return "red"


def _shields(label: str, message: str, color: str) -> str:
    import json as _json
    return _json.dumps({
        "schemaVersion": 1, "label": label, "message": message, "color": color,
    }, indent=2, sort_keys=True) + "\n"


def render_badges(pr_metrics: dict) -> dict[str, str]:
    cov_pct = pr_metrics["coverage"]["lines_pct"]
    dup_pct = pr_metrics["duplication"]["pct"]
    lint_total = pr_metrics["lint"]["total"]

    cov_color = _coverage_color(cov_pct)
    dup_color = _duplication_color(dup_pct)
    lint_color = _lint_color(lint_total)

    colors = [cov_color, dup_color, lint_color]
    rank = {"brightgreen": 0, "yellowgreen": 1, "yellow": 2, "orange": 3, "red": 4}
    composite_color = max(colors, key=lambda c: rank.get(c, 4))

    return {
        "coverage.json":    _shields("coverage", f"{cov_pct}%", cov_color),
        "duplication.json": _shields("duplication", f"{dup_pct}%", dup_color),
        "lint.json":        _shields("lint", str(lint_total), lint_color),
        "quality.json":     _shields("quality", "passing" if composite_color == "brightgreen" else "issues", composite_color),
    }
