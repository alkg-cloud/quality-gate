import json
import subprocess
from pathlib import Path

import pytest

from qg_core.orphan import build_baseline_payload, format_commit_message


def test_build_baseline_payload_includes_required_fields() -> None:
    pr_metrics = {
        "coverage":    {"lines_pct": 80.0, "files": {"a.py": 100.0}},
        "duplication": {"pct": 1.0},
        "lint":        {"total": 0, "by_file": {}},
        "file_size":   {"max_lines": 300, "violations": {}},
        "security":    {"critical": 0, "high": 0, "moderate": 0, "low": 0},
    }
    config = {"thresholds": {"MAX_FILE_LINES": 300, "MIN_NEW_FILE_COVERAGE": 60},
              "ratchet": {"strict": True, "epsilon": 0.0}}
    payload = build_baseline_payload(pr_metrics, config, commit_sha="a" * 40, ref="refs/heads/main", now_iso="2026-05-27T12:00:00Z")
    assert payload["schema_version"] == 1
    assert payload["commit_sha"] == "a" * 40
    assert payload["metrics"]["coverage"]["files"] == {"a.py": 100.0}
    assert payload["config_snapshot"]["MAX_FILE_LINES"] == 300


def test_format_commit_message_with_delta() -> None:
    msg = format_commit_message(short_sha="abc1234", coverage_before=7.0, coverage_after=7.2)
    assert "abc1234" in msg
    assert "7.0%" in msg
    assert "7.2%" in msg


def test_format_commit_message_bootstrap() -> None:
    msg = format_commit_message(short_sha="abc1234", coverage_before=None, coverage_after=7.0)
    assert "bootstrap" in msg.lower()
