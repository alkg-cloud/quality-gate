from qg_core.reporter import render_pr_comment


def _meta() -> dict:
    return {"adapter": "stub", "adapter_version": "0.1", "tools": ["fake"]}


def test_passing_report_renders_success_header() -> None:
    report = {"gate_passed": True, "regressions": [], "warnings": [], "passing": ["coverage_global"], "bootstrap": False}
    pr_metrics = {"coverage": {"lines_pct": 80.0, "files": {}}, "duplication": {"pct": 1.0},
                  "lint": {"total": 0, "by_file": {}}, "file_size": {"max_lines": 300, "violations": {}},
                  "security": {"critical": 0, "high": 0, "moderate": 0, "low": 0}, "_meta": _meta()}
    baseline = {"metrics": pr_metrics, "commit_sha": "abc123" + "0" * 34, "updated_at": "2026-05-26T00:00:00Z"}
    md = render_pr_comment(pr_metrics, baseline, report)
    assert "<!-- quality-gate-marker:v1 -->" in md
    assert "✅ PASSED" in md
    assert "Baseline: `abc123`" in md


def test_failing_report_lists_regressions() -> None:
    report = {"gate_passed": False,
              "regressions": [{"metric": "lint", "scope": "file", "file": "a.py", "baseline": 0, "actual": 5, "delta": 5}],
              "warnings": [], "passing": [], "bootstrap": False}
    pr_metrics = {"coverage": {"lines_pct": 80.0, "files": {}}, "duplication": {"pct": 1.0},
                  "lint": {"total": 5, "by_file": {"a.py": 5}}, "file_size": {"max_lines": 300, "violations": {}},
                  "security": {"critical": 0, "high": 0, "moderate": 0, "low": 0}, "_meta": _meta()}
    baseline = {"metrics": {**pr_metrics, "lint": {"total": 0, "by_file": {}}}, "commit_sha": "a" * 40, "updated_at": "2026-05-26T00:00:00Z"}
    md = render_pr_comment(pr_metrics, baseline, report)
    assert "❌ FAILED" in md
    assert "a.py" in md
    assert "+5" in md


def test_bootstrap_report_explains_first_run() -> None:
    report = {"gate_passed": True, "regressions": [], "warnings": [], "passing": [], "bootstrap": True}
    pr_metrics = {"coverage": {"lines_pct": 1.0, "files": {}}, "duplication": {"pct": 1.0},
                  "lint": {"total": 0, "by_file": {}}, "file_size": {"max_lines": 300, "violations": {}},
                  "security": {"critical": 0, "high": 0, "moderate": 0, "low": 0}, "_meta": _meta()}
    md = render_pr_comment(pr_metrics, baseline=None, report=report)
    assert "Bootstrap pending" in md


def test_security_warning_listed_separately() -> None:
    report = {"gate_passed": True, "regressions": [],
              "warnings": [{"metric": "security", "severity": "high", "count": 2, "delta": 0}],
              "passing": [], "bootstrap": False}
    pr_metrics = {"coverage": {"lines_pct": 80.0, "files": {}}, "duplication": {"pct": 1.0},
                  "lint": {"total": 0, "by_file": {}}, "file_size": {"max_lines": 300, "violations": {}},
                  "security": {"critical": 0, "high": 2, "moderate": 0, "low": 0}, "_meta": _meta()}
    baseline = {"metrics": pr_metrics, "commit_sha": "a" * 40, "updated_at": "2026-05-26T00:00:00Z"}
    md = render_pr_comment(pr_metrics, baseline, report)
    assert "Warnings" in md
    assert "high" in md


def test_renderer_is_deterministic() -> None:
    report = {"gate_passed": True, "regressions": [], "warnings": [], "passing": ["coverage_global"], "bootstrap": False}
    pr = {"coverage": {"lines_pct": 80.0, "files": {}}, "duplication": {"pct": 1.0},
          "lint": {"total": 0, "by_file": {}}, "file_size": {"max_lines": 300, "violations": {}},
          "security": {"critical": 0, "high": 0, "moderate": 0, "low": 0}, "_meta": _meta()}
    baseline = {"metrics": pr, "commit_sha": "a" * 40, "updated_at": "2026-05-26T00:00:00Z"}
    assert render_pr_comment(pr, baseline, report) == render_pr_comment(pr, baseline, report)


import json

from qg_core.reporter import render_badges


def test_coverage_badge_green_when_above_80() -> None:
    badges = render_badges({"coverage": {"lines_pct": 85.0, "files": {}},
                            "duplication": {"pct": 1.0},
                            "lint": {"total": 0, "by_file": {}},
                            "file_size": {"max_lines": 300, "violations": {}},
                            "security": {"critical": 0, "high": 0, "moderate": 0, "low": 0}})
    cov = json.loads(badges["coverage.json"])
    assert cov["color"] == "brightgreen"
    assert cov["message"] == "85.0%"


def test_coverage_badge_red_when_below_20() -> None:
    badges = render_badges({"coverage": {"lines_pct": 7.0, "files": {}},
                            "duplication": {"pct": 1.0},
                            "lint": {"total": 0, "by_file": {}},
                            "file_size": {"max_lines": 300, "violations": {}},
                            "security": {"critical": 0, "high": 0, "moderate": 0, "low": 0}})
    cov = json.loads(badges["coverage.json"])
    assert cov["color"] == "red"


def test_quality_badge_composite_red_when_any_red() -> None:
    badges = render_badges({"coverage": {"lines_pct": 7.0, "files": {}},
                            "duplication": {"pct": 1.0},
                            "lint": {"total": 0, "by_file": {}},
                            "file_size": {"max_lines": 300, "violations": {}},
                            "security": {"critical": 0, "high": 0, "moderate": 0, "low": 0}})
    q = json.loads(badges["quality.json"])
    assert q["color"] == "red"


def test_all_four_badge_files_present() -> None:
    badges = render_badges({"coverage": {"lines_pct": 80.0, "files": {}},
                            "duplication": {"pct": 1.0},
                            "lint": {"total": 0, "by_file": {}},
                            "file_size": {"max_lines": 300, "violations": {}},
                            "security": {"critical": 0, "high": 0, "moderate": 0, "low": 0}})
    assert set(badges) == {"coverage.json", "duplication.json", "lint.json", "quality.json"}
