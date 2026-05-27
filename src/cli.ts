#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

import { collect } from "./collector.js";
import { compare } from "./comparator.js";
import { renderBadges, renderPrComment } from "./reporter.js";
import { buildBaselinePayload, formatCommitMessage } from "./orphan.js";
import type { Baseline, QGConfig, Metrics } from "./types.js";

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

const program = new Command();
program.name("qg-core").description("Quality Gate universal engine");

program.command("collect")
  .requiredOption("--input <dir>")
  .requiredOption("--output <path>")
  .action((opts: { input: string; output: string }) => {
    writeJson(opts.output, collect(opts.input));
  });

program.command("compare")
  .requiredOption("--metrics <path>")
  .requiredOption("--baseline <path>", "baseline path, or NONE to indicate bootstrap")
  .requiredOption("--config <path>")
  .requiredOption("--output <path>")
  .action((opts: { metrics: string; baseline: string; config: string; output: string }) => {
    const metrics = JSON.parse(readFileSync(opts.metrics, "utf-8")) as Metrics;
    const baseline = opts.baseline === "NONE" ? null : (JSON.parse(readFileSync(opts.baseline, "utf-8")) as Baseline);
    const config = JSON.parse(readFileSync(opts.config, "utf-8")) as QGConfig;
    const report = compare(metrics, baseline, config);
    writeJson(opts.output, report);
  });

program.command("report")
  .requiredOption("--metrics <path>")
  .requiredOption("--baseline <path>")
  .requiredOption("--report <path>")
  .requiredOption("--output <path>")
  .action((opts: { metrics: string; baseline: string; report: string; output: string }) => {
    const metrics = JSON.parse(readFileSync(opts.metrics, "utf-8")) as Metrics;
    const baseline = opts.baseline === "NONE" ? null : (JSON.parse(readFileSync(opts.baseline, "utf-8")) as Baseline);
    const report = JSON.parse(readFileSync(opts.report, "utf-8"));
    writeFileSync(opts.output, renderPrComment(metrics, baseline, report));
  });

program.command("render-badges")
  .requiredOption("--metrics <path>")
  .requiredOption("--output-dir <dir>")
  .action((opts: { metrics: string; outputDir: string }) => {
    const metrics = JSON.parse(readFileSync(opts.metrics, "utf-8")) as Metrics;
    mkdirSync(opts.outputDir, { recursive: true });
    const badges = renderBadges(metrics);
    for (const [name, body] of Object.entries(badges)) writeFileSync(`${opts.outputDir}/${name}`, body);
  });

program.command("baseline-payload")
  .requiredOption("--metrics <path>")
  .requiredOption("--config <path>")
  .requiredOption("--commit-sha <sha>")
  .requiredOption("--ref <ref>")
  .requiredOption("--output <path>")
  .action((opts: { metrics: string; config: string; commitSha: string; ref: string; output: string }) => {
    const metrics = JSON.parse(readFileSync(opts.metrics, "utf-8")) as Metrics;
    const config = JSON.parse(readFileSync(opts.config, "utf-8")) as QGConfig;
    writeJson(opts.output, buildBaselinePayload(metrics, config, { commitSha: opts.commitSha, ref: opts.ref }));
  });

program.command("commit-message")
  .requiredOption("--short-sha <sha>")
  .requiredOption("--before <value>", "coverage before; 'NONE' for bootstrap")
  .requiredOption("--after <value>")
  .action((opts: { shortSha: string; before: string; after: string }) => {
    const before = opts.before === "NONE" ? null : Number(opts.before);
    process.stdout.write(formatCommitMessage({ shortSha: opts.shortSha, coverageBefore: before, coverageAfter: Number(opts.after) }) + "\n");
  });

program.command("exit-code")
  .requiredOption("--report <path>")
  .action((opts: { report: string }) => {
    const r = JSON.parse(readFileSync(opts.report, "utf-8"));
    process.exit(r.gate_passed ? 0 : 1);
  });

program.command("pr")
  .description("Run PR-mode gate: collect → compare → report → badges → exit code")
  .requiredOption("--config <path>")
  .requiredOption("--output-dir <dir>")
  .option("--branch <name>", "orphan branch name", "quality-metrics")
  .option("--repo-path <dir>", "project repo path", process.cwd())
  .action(async (opts: { config: string; outputDir: string; branch: string; repoPath: string }) => {
    const { runPr } = await import("./commands/pr.js");
    const { gatePassed } = await runPr({
      configPath: opts.config, outputDir: opts.outputDir, branch: opts.branch, repoPath: opts.repoPath,
    });
    process.exit(gatePassed ? 0 : 1);
  });

program.command("update-baseline")
  .description("Update the orphan branch with a new baseline after main-branch merge")
  .requiredOption("--config <path>")
  .requiredOption("--output-dir <dir>")
  .option("--branch <name>", "orphan branch name", "quality-metrics")
  .option("--repo-path <dir>", "project repo path", process.cwd())
  .option("--readme-template <path>", "orphan branch README template", "")
  .action(async (opts: { config: string; outputDir: string; branch: string; repoPath: string; readmeTemplate: string }) => {
    const { runUpdateBaseline } = await import("./commands/update-baseline.js");
    const token = process.env.GITHUB_TOKEN;
    const repo  = process.env.GITHUB_REPOSITORY;
    const sha   = process.env.GITHUB_SHA;
    const ref   = process.env.GITHUB_REF ?? "refs/heads/main";
    if (!token || !repo || !sha) {
      console.error("update-baseline requires GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA env vars");
      process.exit(2);
    }
    const remoteUrl = `https://x-access-token:${token}@github.com/${repo}.git`;
    const readme = opts.readmeTemplate
      ? readFileSync(opts.readmeTemplate, "utf-8")
      : "# quality-metrics\n\nAuto-managed by Quality Gate. Do not edit by hand.\n";
    const res = await runUpdateBaseline({
      configPath: opts.config, outputDir: opts.outputDir, branch: opts.branch,
      repoPath: opts.repoPath, commitSha: sha, ref, remoteUrl, readmeContent: readme,
    });
    if (!res.pushed) console.log(`no changes (${res.reason})`);
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e);
  process.exit(2);
});
