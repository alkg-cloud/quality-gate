import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { collect } from "../collector.js";
import { renderBadges } from "../reporter.js";
import { pushBaselineToOrphanBranch, resolveBranch } from "../orphan.js";
import type { QGConfig } from "../types.js";

export interface UpdateBaselineArgs {
  outputDir: string;
  configPath: string;
  branch?: string;        // explicit --branch override; falls back to config.branch
  repoPath: string;
  commitSha: string;
  ref: string;
  remoteUrl: string;
  readmeContent: string;
}

export async function runUpdateBaseline(args: UpdateBaselineArgs): Promise<{ pushed: boolean; reason?: string }> {
  const config = JSON.parse(readFileSync(args.configPath, "utf-8")) as QGConfig;
  const branch = resolveBranch(args.branch, config);

  const metrics = collect(args.outputDir);
  writeFileSync(join(args.outputDir, "metrics.json"), JSON.stringify(metrics, null, 2) + "\n");

  const badgesDir = join(args.outputDir, "badges");
  mkdirSync(badgesDir, { recursive: true });
  const badges = renderBadges(metrics);
  for (const [name, body] of Object.entries(badges)) writeFileSync(join(badgesDir, name), body);

  return pushBaselineToOrphanBranch({
    outputDir: args.outputDir,
    configPath: args.configPath,
    branch,
    remoteUrl: args.remoteUrl,
    commitSha: args.commitSha,
    ref: args.ref,
    repoPath: args.repoPath,
    readmeContent: args.readmeContent,
  });
}
