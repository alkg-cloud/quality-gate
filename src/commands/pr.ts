import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { simpleGit } from "simple-git";

import { collect } from "../collector.js";
import { compare } from "../comparator.js";
import { renderBadges, renderPrComment } from "../reporter.js";
import type { Baseline, QGConfig } from "../types.js";

export interface PrCommandArgs {
  outputDir: string;
  configPath: string;
  branch: string;         // orphan branch, e.g. "quality-metrics"
  repoPath: string;       // project root
}

export async function runPr(args: PrCommandArgs): Promise<{ gatePassed: boolean }> {
  const config = JSON.parse(readFileSync(args.configPath, "utf-8")) as QGConfig;

  const metrics = collect(args.outputDir);
  const metricsPath = join(args.outputDir, "metrics.json");
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + "\n");

  // Fetch baseline (NONE if branch doesn't exist)
  let baseline: Baseline | null = null;
  try {
    const git = simpleGit(args.repoPath);
    const remotes = await git.listRemote(["--heads", "origin", args.branch]);
    if (remotes.includes(`refs/heads/${args.branch}`)) {
      await git.fetch("origin", `${args.branch}:refs/remotes/origin/${args.branch}`);
      const text = await git.show([`origin/${args.branch}:baseline.json`]);
      baseline = JSON.parse(text) as Baseline;
      writeFileSync(join(args.outputDir, "baseline.json"), text);
    } else {
      writeFileSync(join(args.outputDir, "baseline.json"), "NONE\n");
    }
  } catch {
    writeFileSync(join(args.outputDir, "baseline.json"), "NONE\n");
  }

  const report = compare(metrics, baseline, config);
  const reportPath = join(args.outputDir, "comparator-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");

  const comment = renderPrComment(metrics, baseline, report);
  const commentPath = join(args.outputDir, "pr-comment.md");
  writeFileSync(commentPath, comment);

  const badgesDir = join(args.outputDir, "badges");
  mkdirSync(badgesDir, { recursive: true });
  const badges = renderBadges(metrics);
  for (const [name, body] of Object.entries(badges)) writeFileSync(join(badgesDir, name), body);

  if (process.env.GITHUB_STEP_SUMMARY && existsSync(process.env.GITHUB_STEP_SUMMARY)) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, comment, { flag: "a" });
  }

  return { gatePassed: report.gate_passed };
}
