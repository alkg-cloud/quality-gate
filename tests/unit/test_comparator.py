from qg_core.comparator import Regression, compare


def _baseline() -> dict:
    return {
        "schema_version": 1,
        "updated_at": "2026-05-26T00:00:00Z",
        "commit_sha": "a" * 40,
        "ref": "refs/heads/main",
        "metrics": {
            "coverage":    {"lines_pct": 80.0, "files": {"a.py": 100.0, "b.py": 60.0}},
            "duplication": {"pct": 2.0},
            "lint":        {"total": 5, "by_file": {"a.py": 5}},
            "file_size":   {"max_lines": 300, "violations": {"big.py": 999}},
            "security":    {"critical": 0, "high": 1, "moderate": 0, "low": 0},
        },
        "config_snapshot": {"MAX_FILE_LINES": 300, "MIN_NEW_FILE_COVERAGE": 60, "ratchet_strict": True},
    }


def _config() -> dict:
    return {
        "schema_version": 1,
        "default_branch": "main",
        "thresholds": {"MAX_FILE_LINES": 300, "MIN_NEW_FILE_COVERAGE": 60},
        "ratchet": {"strict": True, "epsilon": 0.0},
        "metrics": {
            "coverage": {"enabled": True}, "duplication": {"enabled": True},
            "lint": {"enabled": True}, "file_size": {"enabled": True},
            "security": {"enabled": True, "block_severities": ["critical"], "warn_severities": ["high"]},
        },
        "adapter": {"command": "./a.sh", "name": "stub", "version": "0.1"},
    }


def test_no_regressions_when_metrics_match_baseline() -> None:
    bl = _baseline()
    pr = {
        "coverage":    bl["metrics"]["coverage"],
        "duplication": bl["metrics"]["duplication"],
        "lint":        bl["metrics"]["lint"],
        "file_size":   bl["metrics"]["file_size"],
        "security":    bl["metrics"]["security"],
        "_meta":       {"adapter": "stub", "adapter_version": "0.1", "tools": []},
    }
    report = compare(pr, bl, _config())
    assert report["gate_passed"] is True
    assert report["regressions"] == []


def test_coverage_drop_by_any_amount_is_regression() -> None:
    bl = _baseline()
    pr = {**{k: bl["metrics"][k] for k in ("duplication", "lint", "file_size", "security")},
          "coverage": {"lines_pct": 79.99, "files": bl["metrics"]["coverage"]["files"]},
          "_meta": {"adapter": "stub", "adapter_version": "0.1", "tools": []}}
    report = compare(pr, bl, _config())
    assert report["gate_passed"] is False
    assert any(r["metric"] == "coverage" and r["scope"] == "global" for r in report["regressions"])


def test_duplication_increase_is_regression() -> None:
    bl = _baseline()
    pr = {**{k: bl["metrics"][k] for k in ("coverage", "lint", "file_size", "security")},
          "duplication": {"pct": 2.01},
          "_meta": {"adapter": "stub", "adapter_version": "0.1", "tools": []}}
    report = compare(pr, bl, _config())
    assert report["gate_passed"] is False
    assert any(r["metric"] == "duplication" for r in report["regressions"])


def test_security_critical_present_is_blocker_even_if_baseline_had_it() -> None:
    bl = _baseline()
    bl["metrics"]["security"]["critical"] = 1
    pr = {**{k: bl["metrics"][k] for k in ("coverage", "duplication", "lint", "file_size")},
          "security": {"critical": 1, "high": 1, "moderate": 0, "low": 0},
          "_meta": {"adapter": "stub", "adapter_version": "0.1", "tools": []}}
    report = compare(pr, bl, _config())
    assert report["gate_passed"] is False
    assert any(r["metric"] == "security" and r["scope"] == "critical_blocker" for r in report["regressions"])


def test_security_high_is_warning_not_regression() -> None:
    bl = _baseline()
    pr = {**{k: bl["metrics"][k] for k in ("coverage", "duplication", "lint", "file_size")},
          "security": {"critical": 0, "high": 2, "moderate": 0, "low": 0},
          "_meta": {"adapter": "stub", "adapter_version": "0.1", "tools": []}}
    report = compare(pr, bl, _config())
    assert report["gate_passed"] is True
    assert any(w["metric"] == "security" and w["severity"] == "high" and w["count"] == 2 for w in report["warnings"])
