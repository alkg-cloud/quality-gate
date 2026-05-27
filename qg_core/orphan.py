"""Helpers for building baseline payloads and commit messages for the orphan branch."""
from __future__ import annotations

from datetime import datetime, timezone


def build_baseline_payload(pr_metrics: dict, config: dict, commit_sha: str, ref: str, now_iso: str | None = None) -> dict:
    iso = now_iso or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "schema_version": 1,
        "updated_at": iso,
        "commit_sha": commit_sha,
        "ref": ref,
        "metrics": {
            "coverage":    pr_metrics["coverage"],
            "duplication": pr_metrics["duplication"],
            "lint":        pr_metrics["lint"],
            "file_size":   pr_metrics["file_size"],
            "security":    pr_metrics["security"],
        },
        "config_snapshot": {
            "MAX_FILE_LINES":         config["thresholds"]["MAX_FILE_LINES"],
            "MIN_NEW_FILE_COVERAGE":  config["thresholds"]["MIN_NEW_FILE_COVERAGE"],
            "ratchet_strict":         config["ratchet"]["strict"],
        },
    }


def format_commit_message(short_sha: str, coverage_before: float | None, coverage_after: float) -> str:
    if coverage_before is None:
        return f"chore(quality-gate): bootstrap baseline @ {short_sha} [coverage {coverage_after}%]"
    return f"chore(quality-gate): baseline @ {short_sha} [coverage {coverage_before}% → {coverage_after}%]"
