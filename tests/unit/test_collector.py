import json
from pathlib import Path

import pytest

from qg_core.collector import collect


def _write(d: Path, name: str, data: dict) -> None:
    (d / name).write_text(json.dumps(data, indent=2, sort_keys=True))


def _scaffold(d: Path) -> None:
    _write(d, "coverage.json",     {"lines_pct": 80.0, "files": [{"path": "a.py", "lines_pct": 100.0}, {"path": "b.py", "lines_pct": 60.0}]})
    _write(d, "duplication.json",  {"pct": 1.5, "clones": 3})
    _write(d, "lint.json",         {"total": 7, "by_file": [{"path": "a.py", "count": 7}]})
    _write(d, "file_size.json",    {"max_lines": 300, "violations": [{"path": "big.py", "lines": 999}]})
    _write(d, "security.json",     {"critical": 0, "high": 1, "moderate": 2, "low": 3})
    _write(d, "_meta.json",        {"adapter": "stub", "adapter_version": "0.1", "tools": ["fake"]})


def test_collect_normalizes_arrays_to_maps(tmp_qg_output: Path) -> None:
    _scaffold(tmp_qg_output)
    metrics = collect(tmp_qg_output)
    assert metrics["coverage"]["files"] == {"a.py": 100.0, "b.py": 60.0}
    assert metrics["lint"]["by_file"] == {"a.py": 7}
    assert metrics["file_size"]["violations"] == {"big.py": 999}


def test_collect_preserves_global_values(tmp_qg_output: Path) -> None:
    _scaffold(tmp_qg_output)
    metrics = collect(tmp_qg_output)
    assert metrics["coverage"]["lines_pct"] == 80.0
    assert metrics["duplication"]["pct"] == 1.5
    assert metrics["security"]["critical"] == 0
    assert metrics["security"]["high"] == 1


def test_collect_preserves_skipped(tmp_qg_output: Path) -> None:
    _scaffold(tmp_qg_output)
    _write(tmp_qg_output, "duplication.json", {"_skipped": "no tool"})
    metrics = collect(tmp_qg_output)
    assert metrics["duplication"] == {"_skipped": "no tool"}


def test_collect_fails_if_required_file_missing(tmp_qg_output: Path) -> None:
    _scaffold(tmp_qg_output)
    (tmp_qg_output / "coverage.json").unlink()
    with pytest.raises(FileNotFoundError, match="coverage.json"):
        collect(tmp_qg_output)


def test_collect_fails_if_invalid_json(tmp_qg_output: Path) -> None:
    from qg_core.validator import ValidationError
    _scaffold(tmp_qg_output)
    (tmp_qg_output / "coverage.json").write_text('{"lines_pct": "not a number"}')
    with pytest.raises(ValidationError):
        collect(tmp_qg_output)
