"""JSON Schema validation for adapter outputs, baseline, and config."""
from __future__ import annotations

import json
from importlib import resources
from pathlib import Path
from typing import Any, Final

from jsonschema import Draft202012Validator

_METRIC_SCHEMAS: Final[dict[str, str]] = {
    "coverage":    "coverage.schema.json",
    "duplication": "duplication.schema.json",
    "lint":        "lint.schema.json",
    "file_size":   "file_size.schema.json",
    "security":    "security.schema.json",
    "_meta":       "_meta.schema.json",
}


class ValidationError(Exception):
    """Raised when JSON does not conform to its schema."""


def _load_schema(name: str) -> dict[str, Any]:
    text = resources.files("qg_core.schemas").joinpath(name).read_text(encoding="utf-8")
    result: dict[str, Any] = json.loads(text)
    return result


def _collect_error_messages(errors: list[Any]) -> list[str]:
    """Recursively collect error messages, expanding oneOf/anyOf context errors."""
    msgs: list[str] = []
    for e in errors:
        if e.context:
            # oneOf/anyOf: include sub-errors from all branches for better messages
            msgs.extend(_collect_error_messages(list(e.context)))
        else:
            msgs.append(f"{list(e.absolute_path)}: {e.message}")
    return msgs


def _validate(data: dict[str, Any], schema_filename: str) -> None:
    schema = _load_schema(schema_filename)
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
    if errors:
        msgs = _collect_error_messages(errors)
        raise ValidationError("; ".join(msgs))


def validate_adapter_output(metric: str, path: Path) -> None:
    if metric not in _METRIC_SCHEMAS:
        raise ValueError(f"unknown metric: {metric}")
    data = json.loads(path.read_text(encoding="utf-8"))
    _validate(data, _METRIC_SCHEMAS[metric])


def validate_baseline(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    _validate(data, "baseline.schema.json")


def validate_config(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    _validate(data, "config.schema.json")
