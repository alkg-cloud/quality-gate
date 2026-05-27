"""Single CLI: collect | compare | report | bootstrap-payload | render-badges."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from qg_core.collector import collect
from qg_core.comparator import compare
from qg_core.orphan import build_baseline_payload, format_commit_message
from qg_core.reporter import render_badges, render_pr_comment


def _write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _cmd_collect(args: argparse.Namespace) -> int:
    metrics = collect(Path(args.input))
    _write_json(Path(args.output), metrics)
    return 0


def _cmd_compare(args: argparse.Namespace) -> int:
    metrics = json.loads(Path(args.metrics).read_text(encoding="utf-8"))
    baseline = None if args.baseline == "NONE" else json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    config   = json.loads(Path(args.config).read_text(encoding="utf-8"))
    report = compare(metrics, baseline, config)
    _write_json(Path(args.output), report)
    return 0  # Always 0; gate exit code is a separate command.


def _cmd_report(args: argparse.Namespace) -> int:
    metrics = json.loads(Path(args.metrics).read_text(encoding="utf-8"))
    baseline = None if args.baseline == "NONE" else json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    report  = json.loads(Path(args.report).read_text(encoding="utf-8"))
    md = render_pr_comment(metrics, baseline, report)
    Path(args.output).write_text(md, encoding="utf-8")
    return 0


def _cmd_render_badges(args: argparse.Namespace) -> int:
    metrics = json.loads(Path(args.metrics).read_text(encoding="utf-8"))
    badges = render_badges(metrics)
    out = Path(args.output_dir); out.mkdir(parents=True, exist_ok=True)
    for name, body in badges.items():
        (out / name).write_text(body, encoding="utf-8")
    return 0


def _cmd_baseline_payload(args: argparse.Namespace) -> int:
    metrics = json.loads(Path(args.metrics).read_text(encoding="utf-8"))
    config  = json.loads(Path(args.config).read_text(encoding="utf-8"))
    payload = build_baseline_payload(metrics, config, commit_sha=args.commit_sha, ref=args.ref)
    _write_json(Path(args.output), payload)
    return 0


def _cmd_commit_message(args: argparse.Namespace) -> int:
    before = None if args.before == "NONE" else float(args.before)
    msg = format_commit_message(args.short_sha, before, float(args.after))
    sys.stdout.write(msg + "\n")
    return 0


def _cmd_exit_code(args: argparse.Namespace) -> int:
    report = json.loads(Path(args.report).read_text(encoding="utf-8"))
    return 0 if report["gate_passed"] else 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="qg")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("collect"); c.add_argument("--input", required=True); c.add_argument("--output", required=True); c.set_defaults(fn=_cmd_collect)
    c = sub.add_parser("compare"); c.add_argument("--metrics", required=True); c.add_argument("--baseline", required=True); c.add_argument("--config", required=True); c.add_argument("--output", required=True); c.set_defaults(fn=_cmd_compare)
    c = sub.add_parser("report");  c.add_argument("--metrics", required=True); c.add_argument("--baseline", required=True); c.add_argument("--report", required=True); c.add_argument("--output", required=True); c.set_defaults(fn=_cmd_report)
    c = sub.add_parser("render-badges"); c.add_argument("--metrics", required=True); c.add_argument("--output-dir", required=True); c.set_defaults(fn=_cmd_render_badges)
    c = sub.add_parser("baseline-payload"); c.add_argument("--metrics", required=True); c.add_argument("--config", required=True); c.add_argument("--commit-sha", required=True); c.add_argument("--ref", required=True); c.add_argument("--output", required=True); c.set_defaults(fn=_cmd_baseline_payload)
    c = sub.add_parser("commit-message"); c.add_argument("--short-sha", required=True); c.add_argument("--before", required=True); c.add_argument("--after", required=True); c.set_defaults(fn=_cmd_commit_message)
    c = sub.add_parser("exit-code"); c.add_argument("--report", required=True); c.set_defaults(fn=_cmd_exit_code)

    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
