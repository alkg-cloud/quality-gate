import json
from pathlib import Path

import pytest

from qg_core.validator import ValidationError, validate_adapter_output, validate_baseline, validate_config


def _write(p: Path, data: dict) -> Path:
    p.write_text(json.dumps(data, indent=2, sort_keys=True))
    return p


def test_valid_coverage_passes(tmp_path: Path) -> None:
    p = _write(tmp_path / "coverage.json", {"lines_pct": 80.0, "files": [{"path": "a.py", "lines_pct": 100.0}]})
    validate_adapter_output("coverage", p)


def test_skipped_coverage_passes(tmp_path: Path) -> None:
    p = _write(tmp_path / "coverage.json", {"_skipped": "no tool"})
    validate_adapter_output("coverage", p)


def test_missing_files_field_fails(tmp_path: Path) -> None:
    p = _write(tmp_path / "coverage.json", {"lines_pct": 80.0})
    with pytest.raises(ValidationError, match="required"):
        validate_adapter_output("coverage", p)


def test_unknown_metric_name_raises(tmp_path: Path) -> None:
    p = _write(tmp_path / "x.json", {"any": 1})
    with pytest.raises(ValueError, match="unknown metric"):
        validate_adapter_output("unknown_metric", p)


def test_valid_config_passes(tmp_path: Path) -> None:
    cfg = {
        "schema_version": 1,
        "default_branch": "main",
        "thresholds": {"MAX_FILE_LINES": 300, "MIN_NEW_FILE_COVERAGE": 60},
        "ratchet": {"strict": True, "epsilon": 0.0},
        "metrics": {
            "coverage":    {"enabled": True},
            "duplication": {"enabled": True},
            "lint":        {"enabled": True},
            "file_size":   {"enabled": True},
            "security":    {"enabled": True, "block_severities": ["critical"], "warn_severities": ["high"]},
        },
        "adapter": {"command": "./adapter.sh", "name": "stub", "version": "0.1"},
    }
    validate_config(_write(tmp_path / "c.json", cfg))


def test_strict_with_nonzero_epsilon_fails(tmp_path: Path) -> None:
    cfg = {
        "schema_version": 1,
        "default_branch": "main",
        "thresholds": {"MAX_FILE_LINES": 300, "MIN_NEW_FILE_COVERAGE": 60},
        "ratchet": {"strict": True, "epsilon": 0.5},
        "metrics": {
            "coverage": {"enabled": True}, "duplication": {"enabled": True},
            "lint": {"enabled": True}, "file_size": {"enabled": True},
            "security": {"enabled": True, "block_severities": ["critical"], "warn_severities": ["high"]},
        },
        "adapter": {"command": "./a.sh", "name": "s", "version": "0.1"},
    }
    with pytest.raises(ValidationError):
        validate_config(_write(tmp_path / "c.json", cfg))
