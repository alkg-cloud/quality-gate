import { existsSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { Baseline, Metrics, QGConfig } from "./types.js";

const DEFAULT_BRANCH = "quality-metrics";

/** Orphan-branch precedence: explicit --branch flag > config.branch > "quality-metrics". */
export function resolveBranch(flagBranch: string | undefined, config: QGConfig): string {
  return flagBranch ?? config.branch ?? DEFAULT_BRANCH;
}

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

export interface PushBaselineArgs {
  outputDir: string;       // contains metrics.json, badges/, etc. produced by adapter+pipeline
  configPath: string;
  branch: string;          // e.g. "quality-metrics"
  remoteUrl: string;       // e.g. `https://x-access-token:${token}@github.com/${repo}.git`
  commitSha: string;
  ref: string;
  repoPath: string;        // path of the project repo (used to fetch existing branch)
  readmeContent: string;   // content of orphan-branch-readme.md template
}

const ORPHAN_USER_EMAIL = "quality-gate-bot@users.noreply.github.com";
const ORPHAN_USER_NAME  = "quality-gate-bot";

export async function pushBaselineToOrphanBranch(args: PushBaselineArgs): Promise<{ pushed: boolean; reason?: string }> {
  const tempDir = mkdtempSync(join(tmpdir(), "qg-orphan-"));
  try {
    const projectGit = simpleGit(args.repoPath);
    const remotes = await projectGit.listRemote(["--heads", "origin", args.branch]).catch(() => "");
    const branchExists = remotes.includes(`refs/heads/${args.branch}`);

    let coverageBefore: number | null = null;

    if (branchExists) {
      await projectGit.fetch("origin", `${args.branch}:refs/remotes/origin/${args.branch}`);
      // Create a worktree on the existing branch
      await projectGit.raw(["worktree", "add", "-B", args.branch, tempDir, `origin/${args.branch}`]);
      const existingBaseline = join(tempDir, "baseline.json");
      if (existsSync(existingBaseline)) {
        const data: unknown = JSON.parse(await readFile(existingBaseline, "utf-8")) as unknown;
        const blData = data as { metrics?: { coverage?: { lines_pct?: number } } };
        if (blData?.metrics?.coverage?.lines_pct !== undefined) coverageBefore = blData.metrics.coverage.lines_pct;
      }
    } else {
      await projectGit.raw(["worktree", "add", "--orphan", "-B", args.branch, tempDir]);
      // wipe whatever the worktree inherited (none on a fresh orphan, but be safe)
      for (const entry of readdirSync(tempDir)) {
        if (entry === ".git") continue;
        rmSync(join(tempDir, entry), { recursive: true, force: true });
      }
    }

    // Read fresh metrics + config
    const metricsPath = join(args.outputDir, "metrics.json");
    const metricsData = JSON.parse(await readFile(metricsPath, "utf-8")) as Metrics;
    const configData = JSON.parse(await readFile(args.configPath, "utf-8")) as QGConfig;
    const payload = buildBaselinePayload(metricsData, configData, {
      commitSha: args.commitSha, ref: args.ref,
    });

    writeFileSync(join(tempDir, "baseline.json"), JSON.stringify(payload, null, 2) + "\n");
    mkdirSync(join(tempDir, "badges"), { recursive: true });
    mkdirSync(join(tempDir, "history"), { recursive: true });

    const badgesDir = join(args.outputDir, "badges");
    if (existsSync(badgesDir)) {
      for (const f of readdirSync(badgesDir)) {
        copyFileSync(join(badgesDir, f), join(tempDir, "badges", f));
      }
    }

    const date = new Date().toISOString().slice(0, 10);
    const short = args.commitSha.slice(0, 7);
    copyFileSync(join(tempDir, "baseline.json"), join(tempDir, "history", `${date}-${short}.json`));

    const readmePath = join(tempDir, "README.md");
    if (!existsSync(readmePath)) writeFileSync(readmePath, args.readmeContent);

    const worktreeGit = simpleGit(tempDir);
    await worktreeGit.addConfig("user.email", ORPHAN_USER_EMAIL);
    await worktreeGit.addConfig("user.name",  ORPHAN_USER_NAME);
    await worktreeGit.add(["baseline.json", "badges", "history", "README.md"]);

    const status = await worktreeGit.status();
    if (status.staged.length === 0) {
      await projectGit.raw(["worktree", "remove", "--force", tempDir]);
      return { pushed: false, reason: "no changes" };
    }

    const msg = formatCommitMessage({
      shortSha: short,
      coverageBefore,
      coverageAfter: payload.metrics.coverage && "lines_pct" in payload.metrics.coverage
        ? payload.metrics.coverage.lines_pct
        : 0,
    });
    await worktreeGit.commit(msg);
    await worktreeGit.push(args.remoteUrl, `${args.branch}:${args.branch}`);
    await projectGit.raw(["worktree", "remove", "--force", tempDir]);
    return { pushed: true };
  } catch (e) {
    rmSync(tempDir, { recursive: true, force: true });
    throw e;
  }
}
