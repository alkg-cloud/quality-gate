import json
import subprocess
import sys
from pathlib import Path


def _write(p: Path, data: dict) -> None:
    p.write_text(json.dumps(data, indent=2, sort_keys=True))


def _config_data() -> dict:
    return {
        "schema_version": 1, "default_branch": "main",
        "thresholds": {"MAX_FILE_LINES": 300, "MIN_NEW_FILE_COVERAGE": 60},
        "ratchet": {"strict": True, "epsilon": 0.0},
        "metrics": {
            "coverage": {"enabled": True}, "duplication": {"enabled": True},
            "lint": {"enabled": True}, "file_size": {"enabled": True},
            "security": {"enabled": True, "block_severities": ["critical"], "warn_severities": ["high"]},  # noqa: E501
        },
        "adapter": {"command": "./a.sh", "name": "s", "version": "0.1"},
    }


def _scaffold_outputs(d: Path) -> None:
    _write(d / "coverage.json",     {"lines_pct": 80.0, "files": [{"path": "a.py", "lines_pct": 100.0}]})  # noqa: E501
    _write(d / "duplication.json",  {"pct": 1.0})
    _write(d / "lint.json",         {"total": 0, "by_file": []})
    _write(d / "file_size.json",    {"max_lines": 300, "violations": []})
    _write(d / "security.json",     {"critical": 0, "high": 0, "moderate": 0, "low": 0})
    _write(d / "_meta.json",        {"adapter": "stub", "adapter_version": "0.1", "tools": []})


def test_collect_subcommand_writes_metrics_json(tmp_path: Path) -> None:
    _scaffold_outputs(tmp_path)
    metrics_path = tmp_path / "metrics.json"
    subprocess.check_call([sys.executable, "-m", "qg_core.cli", "collect",
                           "--input", str(tmp_path), "--output", str(metrics_path)])
    data = json.loads(metrics_path.read_text())
    assert data["coverage"]["lines_pct"] == 80.0


def test_compare_subcommand_writes_report(tmp_path: Path) -> None:
    _scaffold_outputs(tmp_path)
    metrics_path = tmp_path / "metrics.json"
    config_path  = tmp_path / "config.json"
    report_path  = tmp_path / "comparator-report.json"
    _write(config_path, _config_data())
    subprocess.check_call([sys.executable, "-m", "qg_core.cli", "collect",
                           "--input", str(tmp_path), "--output", str(metrics_path)])
    rc = subprocess.call([sys.executable, "-m", "qg_core.cli", "compare",
                          "--metrics", str(metrics_path),
                          "--baseline", "NONE",
                          "--config", str(config_path),
                          "--output", str(report_path)])
    assert rc == 0  # bootstrap mode → pass
    report = json.loads(report_path.read_text())
    assert report["bootstrap"] is True
    assert report["gate_passed"] is True
