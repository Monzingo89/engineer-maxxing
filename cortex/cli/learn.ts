#!/usr/bin/env node

import path from "path";
import { Command } from "commander";
import { learn } from "../workflows/learn.workflow.js";
import { cleanRepo } from "../workflows/clean.workflow.js";
import { reorganizeRepo } from "../workflows/reorganize.workflow.js";

type CliOptions = {
  path?: string;
  maxFileBytes: string;
  includeExt?: string;
  excludeDir?: string;
  repoModels?: string;
  fresh?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  jsonSummary?: boolean;
};

type CleanCliOptions = {
  path?: string;
  quiet?: boolean;
  jsonSummary?: boolean;
};

type ReorganizeCliOptions = {
  path?: string;
  quiet?: boolean;
  jsonSummary?: boolean;
};

function parseCsv(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function runInRepoRoot<T>(repoRoot: string, action: () => Promise<T>): Promise<T> {
  const previousCwd = process.cwd();
  process.chdir(repoRoot);

  try {
    return await action();
  } finally {
    process.chdir(previousCwd);
  }
}

const program = new Command();

program
  .name("engineer-maxxing")
  .description("Scan a repository and update Cortex memory files with realtime token usage and technology docs context.")
  .argument("[repoPath]", "Path to the repository root (default: current working directory)")
  .option("--path <repoPath>", "Explicit repository path (overrides positional repoPath)")
  .option("--max-file-bytes <bytes>", "Maximum bytes from each file sent to prompts", "20000")
  .option("--include-ext <extensions>", "Additional file extensions to include, comma-separated (example: .toml,.env)")
  .option("--exclude-dir <directories>", "Additional directory names to exclude, comma-separated")
  .option("--repo-models <models>", "Comma-separated repo authoring models (Codex,Grok,ChatGPT,Claude Haiku,Claude Sonnet,Claude Opus,Gemini,Manual)")
  .option("--fresh", "Reset anatomy and local cortex state before scanning")
  .option("--quiet", "Suppress per-file progress output")
  .option("--verbose", "Print verbose per-file token usage output")
  .option("--json-summary", "Print final run summary as JSON")
  .action(async (repoPath: string | undefined, options: CliOptions) => {
    const cwd = process.cwd();
    const repoRootInput = options.path || repoPath || cwd;
    const repoRoot = path.resolve(cwd, repoRootInput);

    const maxFileBytes = Number.parseInt(options.maxFileBytes, 10);

    if (!Number.isFinite(maxFileBytes) || maxFileBytes <= 0) {
      throw new Error(`Invalid --max-file-bytes value: ${options.maxFileBytes}`);
    }

    const quiet = Boolean((options.quiet && !options.verbose) || (options.jsonSummary && !options.verbose));

    const summary = await runInRepoRoot(repoRoot, async () =>
      learn(process.cwd(), {
        maxFileBytes,
        includeExt: parseCsv(options.includeExt),
        excludeDirs: parseCsv(options.excludeDir),
        repoModels: parseCsv(options.repoModels),
        freshStart: Boolean(options.fresh),
        quiet,
        verbose: Boolean(options.verbose)
      })
    );

    if (options.jsonSummary) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    }
  });

program
  .command("clean-repo [repoPath]")
  .description("Generate an actionable CLEAN_REPO plan from anatomy and .cortex context")
  .option("--path <repoPath>", "Explicit repository path (overrides positional repoPath)")
  .option("--quiet", "Suppress command output")
  .option("--json-summary", "Print final run summary as JSON")
  .action(async (repoPath: string | undefined, options: CleanCliOptions) => {
    const cwd = process.cwd();
    const repoRootInput = options.path || repoPath || cwd;
    const repoRoot = path.resolve(cwd, repoRootInput);
    const quiet = Boolean(options.quiet || options.jsonSummary);

    const summary = await runInRepoRoot(repoRoot, async () =>
      cleanRepo(process.cwd(), {
        quiet
      })
    );

    if (options.jsonSummary) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    }
  });

program
  .command("reorganize-repo [repoPath]")
  .description("Generate a SIMPLIFY_REPO reorganization plan from anatomy and SOUL technology docs")
  .option("--path <repoPath>", "Explicit repository path (overrides positional repoPath)")
  .option("--quiet", "Suppress command output")
  .option("--json-summary", "Print final run summary as JSON")
  .action(async (repoPath: string | undefined, options: ReorganizeCliOptions) => {
    const cwd = process.cwd();
    const repoRootInput = options.path || repoPath || cwd;
    const repoRoot = path.resolve(cwd, repoRootInput);
    const quiet = Boolean(options.quiet || options.jsonSummary);

    const summary = await runInRepoRoot(repoRoot, async () =>
      reorganizeRepo(process.cwd(), {
        quiet
      })
    );

    if (options.jsonSummary) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    }
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
