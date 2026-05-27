import type { Baseline, Metrics, QGConfig } from "./types.js";

export interface BuildBaselineArgs {
  commitSha: string;
  ref: string;
  nowIso?: string;
}

export function buildBaselinePayload(metrics: Metrics, config: QGConfig, args: BuildBaselineArgs): Baseline {
  const iso = args.nowIso ?? new Date().toISOString().replace(/\.\d+Z$/, "Z");
  return {
    schema_version: 1,
    updated_at: iso,
    commit_sha: args.commitSha,
    ref: args.ref,
    metrics: {
      coverage:    metrics.coverage,
      duplication: metrics.duplication,
      lint:        metrics.lint,
      file_size:   metrics.file_size,
      security:    metrics.security,
    },
    config_snapshot: {
      MAX_FILE_LINES:        config.thresholds.MAX_FILE_LINES,
      MIN_NEW_FILE_COVERAGE: config.thresholds.MIN_NEW_FILE_COVERAGE,
      ratchet_strict:        config.ratchet.strict,
    },
  };
}

export interface FormatCommitMessageArgs {
  shortSha: string;
  coverageBefore: number | null;
  coverageAfter: number;
}

export function formatCommitMessage(args: FormatCommitMessageArgs): string {
  const { shortSha, coverageBefore, coverageAfter } = args;
  if (coverageBefore === null) {
    return `chore(quality-gate): bootstrap baseline @ ${shortSha} [coverage ${coverageAfter}%]`;
  }
  return `chore(quality-gate): baseline @ ${shortSha} [coverage ${coverageBefore}% → ${coverageAfter}%]`;
}
