"""Collector: adapter outputs (arrays) -> normalized metrics dict (maps)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Final

from qg_core.validator import validate_adapter_output

_REQUIRED_METRICS: Final[tuple[str, ...]] = (
    "coverage", "duplication", "lint", "file_size", "security", "_meta",
)


def _load(d: Path, name: str) -> dict[str, Any]:
    path = d / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(f"missing required adapter output: {path.name}")
    result: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return result


def _is_skipped(data: dict[str, Any]) -> bool:
    return "_skipped" in data


def _normalize_coverage(data: dict[str, Any]) -> dict[str, Any]:
    if _is_skipped(data):
        return data
    files_map = {f["path"]: f["lines_pct"] for f in data["files"]}
    return {"lines_pct": data["lines_pct"], "files": files_map}


def _normalize_lint(data: dict[str, Any]) -> dict[str, Any]:
    if _is_skipped(data):
        return data
    by_file = {f["path"]: f["count"] for f in data["by_file"]}
    return {"total": data["total"], "by_file": by_file}


def _normalize_file_size(data: dict[str, Any]) -> dict[str, Any]:
    if _is_skipped(data):
        return data
    violations = {f["path"]: f["lines"] for f in data["violations"]}
    return {"max_lines": data["max_lines"], "violations": violations}


def collect(output_dir: Path) -> dict[str, Any]:
    """Read adapter outputs, validate, normalize array→map. Returns metrics dict."""
    raw = {name: _load(output_dir, name) for name in _REQUIRED_METRICS}
    for name in _REQUIRED_METRICS:
        validate_adapter_output(name, output_dir / f"{name}.json")
    return {
        "coverage":    _normalize_coverage(raw["coverage"]),
        "duplication": raw["duplication"],
        "lint":        _normalize_lint(raw["lint"]),
        "file_size":   _normalize_file_size(raw["file_size"]),
        "security":    raw["security"],
        "_meta":       raw["_meta"],
    }
