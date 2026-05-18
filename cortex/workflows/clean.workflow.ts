import fs from "fs";
import path from "path";
import chalk from "chalk";
import { RepoBrainState } from "../context/repo-brain.store.js";
import { createRepoEvent } from "../events/event-factory.js";
import { RepoEventType } from "../enums/repo-event-type.enum.js";
import { RepoMemoryFile } from "../enums/repo-memory-file.enum.js";
import { RepoTask } from "../enums/repo-task.enum.js";
import { GlobalContext } from "../observable/global-context.js";
import { appendOrganEvent, ensureAnatomyFilesExist } from "../writers/organ-writer.js";

export type CleanRepoOptions = {
  quiet: boolean;
  deadCodeSampleSize: number;
};

export type CleanRepoSummary = {
  repoRoot: string;
  planPath: string;
  deadCodeQueuePath?: string;
  learnTaskStatus: string;
  cleanTaskStatus: "not_started" | "in_progress" | "completed";
  secretSignalCount: number;
  deadCodeCandidateCount: number;
  unusedRuntimeDependencyCount: number;
  heavyDependencyCount: number;
  queuedActionCount: number;
  generatedAt: string;
};

const DEFAULT_CLEAN_OPTIONS: CleanRepoOptions = {
  quiet: false,
  deadCodeSampleSize: 60
};

function resolveCleanOptions(input?: Partial<CleanRepoOptions>): CleanRepoOptions {
  const merged = {
    ...DEFAULT_CLEAN_OPTIONS,
    ...(input || {})
  };

  const deadCodeSampleSize = Number.isFinite(merged.deadCodeSampleSize)
    ? Math.max(1, Math.floor(merged.deadCodeSampleSize))
    : DEFAULT_CLEAN_OPTIONS.deadCodeSampleSize;

  return {
    ...merged,
    deadCodeSampleSize
  };
}

function uniqueSorted(items: string[]): string[] {
  return Array.from(new Set(items)).sort((a, b) => a.localeCompare(b));
}

function collectSecretSignals(state: RepoBrainState): string[] {
  const findings: string[] = [];

  for (const event of state.nose) {
    if (event.type !== RepoEventType.SECRET_EXPOSURE_DETECTED) continue;
    findings.push(...event.evidence);
  }

  return uniqueSorted(findings);
}

function writeDeadCodeQueueFile(repoRoot: string, deadCodeCandidates: string[]): string {
  const relativePath = "anatomy/CLEANUP_DEAD_CODE_QUEUE.txt";
  const absolutePath = path.join(repoRoot, relativePath);

  const lines = [
    "# Dead Code Queue",
    "",
    `Total candidates: ${deadCodeCandidates.length}`,
    "",
    ...deadCodeCandidates.map((candidate) => candidate)
  ];

  fs.writeFileSync(absolutePath, `${lines.join("\n")}\n`, "utf8");

  return relativePath;
}

export function buildCleanupPlanMarkdown(input: {
  generatedAtIso: string;
  secretSignals: string[];
  deadCodeCandidates: string[];
  deadCodeQueuePath?: string;
  deadCodeSampleSize: number;
  unusedRuntimeDependencies: string[];
  heavyDependencies: string[];
  learnTaskStatus: string;
}): string {
  const lines: string[] = [];

  lines.push("# CLEANUP_PLAN.md");
  lines.push("");
  lines.push(
    "Actionable cleanup plan generated from current anatomy and `.cortex/context.json` state."
  );
  lines.push("");
  lines.push(`- Generated at: ${input.generatedAtIso}`);
  lines.push(`- LEARN_REPO status: \`${input.learnTaskStatus}\``);
  lines.push(`- Secret signals: **${input.secretSignals.length}**`);
  lines.push(`- Dead-code candidates: **${input.deadCodeCandidates.length}**`);
  lines.push(`- Unused runtime dependencies: **${input.unusedRuntimeDependencies.length}**`);
  lines.push(`- Heavy dependencies flagged: **${input.heavyDependencies.length}**`);
  lines.push("");

  lines.push("## Phase 0 — Security first (blocker)");
  lines.push("");

  if (input.secretSignals.length === 0) {
    lines.push("- No secret exposure signals detected in current anatomy.");
  } else {
    lines.push("- Rotate/revoke exposed credentials before other cleanup work.");
    lines.push("- Remove secret material from tracked files and replace with environment-driven config.");
    lines.push("- Audit git history if credentials were committed previously.");
    lines.push("");
    lines.push("Current secret signals:");
    lines.push(...input.secretSignals.map((item) => `- ${item}`));
  }

  lines.push("");
  lines.push("## Phase 1 — Dependency hygiene");
  lines.push("");

  if (input.unusedRuntimeDependencies.length === 0 && input.heavyDependencies.length === 0) {
    lines.push("- No dependency cleanup items detected.");
  } else {
    if (input.unusedRuntimeDependencies.length > 0) {
      lines.push("Unused runtime dependencies:");
      lines.push(...input.unusedRuntimeDependencies.map((dep) => `- ${dep}`));
      lines.push("");
    }

    if (input.heavyDependencies.length > 0) {
      lines.push("Heavy dependencies to review:");
      lines.push(...input.heavyDependencies.map((dep) => `- ${dep}`));
      lines.push("");
    }

    lines.push("- Remove one dependency group at a time.");
    lines.push("- Run tests/build after each removal batch.");
  }

  lines.push("");
  lines.push("## Phase 2 — Dead code triage");
  lines.push("");

  if (input.deadCodeCandidates.length === 0) {
    lines.push("- No dead-code candidates detected.");
  } else {
    lines.push("- Triage in small batches (scripts first, then handlers/functions, then ambiguous framework files).");
    lines.push("- Keep changes reversible (small PRs/commits).\n");

    if (input.deadCodeQueuePath) {
      lines.push(`- Full queue: \`${input.deadCodeQueuePath}\``);
      lines.push("");
    }

    lines.push(`Sample candidates (first ${Math.min(input.deadCodeSampleSize, input.deadCodeCandidates.length)}):`);
    lines.push(
      ...input.deadCodeCandidates
        .slice(0, input.deadCodeSampleSize)
        .map((candidate) => `- ${candidate}`)
    );
  }

  lines.push("");
  lines.push("## Execution loop");
  lines.push("");
  lines.push("1. Complete one cleanup batch.");
  lines.push("2. Run project tests/build/lint.");
  lines.push("3. Re-run learn pass to refresh anatomy.");
  lines.push("4. Re-run `clean-repo` to regenerate this action plan.");

  return `${lines.join("\n")}\n`;
}

export async function cleanRepo(repoRoot: string, inputOptions?: Partial<CleanRepoOptions>): Promise<CleanRepoSummary> {
  const options = resolveCleanOptions(inputOptions);
  ensureAnatomyFilesExist();

  const contextPath = path.join(repoRoot, ".cortex", "context.json");
  if (!fs.existsSync(contextPath)) {
    throw new Error(
      "No .cortex/context.json found for this repository. Run `npx @monzingo89/engineer-maxxing --fresh` first."
    );
  }

  const state = GlobalContext.get();
  const learnTask = state.activeContext.tasks[RepoTask.LEARN_REPO];

  const secretSignals = collectSecretSignals(state);
  const deadCodeCandidates = uniqueSorted(state.learned.deadCodeCandidates || []);
  const dependencyAudit = state.learned.dependencyAudit;
  const unusedRuntimeDependencies = uniqueSorted(dependencyAudit?.unusedDependencies || []);
  const heavyDependencies = uniqueSorted(dependencyAudit?.heavyDependencies || []);

  const generatedAtIso = new Date().toISOString();

  const deadCodeQueuePath =
    deadCodeCandidates.length > 0 ? writeDeadCodeQueueFile(repoRoot, deadCodeCandidates) : undefined;

  const planMarkdown = buildCleanupPlanMarkdown({
    generatedAtIso,
    secretSignals,
    deadCodeCandidates,
    deadCodeQueuePath,
    deadCodeSampleSize: options.deadCodeSampleSize,
    unusedRuntimeDependencies,
    heavyDependencies,
    learnTaskStatus: learnTask.status
  });

  const planPath = "anatomy/CLEANUP_PLAN.md";
  fs.writeFileSync(path.join(repoRoot, planPath), planMarkdown, "utf8");

  const queuedActionCount =
    (secretSignals.length > 0 ? 1 : 0) +
    (unusedRuntimeDependencies.length > 0 || heavyDependencies.length > 0 ? 1 : 0) +
    (deadCodeCandidates.length > 0 ? 1 : 0) +
    1;

  const hasCleanupFindings =
    secretSignals.length > 0 ||
    deadCodeCandidates.length > 0 ||
    unusedRuntimeDependencies.length > 0 ||
    heavyDependencies.length > 0;

  const cleanTaskStatus: "in_progress" | "completed" = hasCleanupFindings ? "in_progress" : "completed";

  GlobalContext.setTaskProgress(RepoTask.CLEAN_REPO, {
    status: cleanTaskStatus,
    totalItems: queuedActionCount,
    completedItems: hasCleanupFindings ? 1 : queuedActionCount,
    note: hasCleanupFindings
      ? "Cleanup action plan generated. Execute batches and re-run clean-repo until findings are resolved."
      : "No cleanup findings remain."
  });

  const taskEvent = createRepoEvent({
    type: RepoEventType.TASK_PROGRESS_UPDATED,
    targetFile: RepoMemoryFile.HANDS,
    title: hasCleanupFindings ? "Task updated: CLEAN_REPO" : "Task completed: CLEAN_REPO",
    summary: hasCleanupFindings
      ? "Action plan generated from anatomy. Proceed with security, dependency, and dead-code cleanup batches."
      : "No cleanup findings detected; CLEAN_REPO is complete.",
    evidence: [
      `plan: ${planPath}`,
      deadCodeQueuePath ? `dead-code queue: ${deadCodeQueuePath}` : "dead-code queue: none",
      `secret signals: ${secretSignals.length}`,
      `dead-code candidates: ${deadCodeCandidates.length}`,
      `unused runtime dependencies: ${unusedRuntimeDependencies.length}`,
      `heavy dependencies: ${heavyDependencies.length}`
    ],
    severity: hasCleanupFindings ? "medium" : "info",
    confidence: "high"
  });

  GlobalContext.pushEvent(taskEvent);
  appendOrganEvent(taskEvent);

  const summary: CleanRepoSummary = {
    repoRoot,
    planPath,
    deadCodeQueuePath,
    learnTaskStatus: learnTask.status,
    cleanTaskStatus,
    secretSignalCount: secretSignals.length,
    deadCodeCandidateCount: deadCodeCandidates.length,
    unusedRuntimeDependencyCount: unusedRuntimeDependencies.length,
    heavyDependencyCount: heavyDependencies.length,
    queuedActionCount,
    generatedAt: generatedAtIso
  };

  if (!options.quiet) {
    console.log(chalk.cyan("CLEAN_REPO action plan generated."));
    console.log(`- Plan: ${summary.planPath}`);
    if (summary.deadCodeQueuePath) console.log(`- Dead-code queue: ${summary.deadCodeQueuePath}`);
    console.log(`- Secret signals: ${summary.secretSignalCount}`);
    console.log(`- Dead-code candidates: ${summary.deadCodeCandidateCount}`);
    console.log(`- Unused runtime dependencies: ${summary.unusedRuntimeDependencyCount}`);
    console.log(`- Heavy dependencies: ${summary.heavyDependencyCount}`);
    console.log("Next: execute one cleanup batch, run tests, then re-run learn + clean-repo.");
  }

  return summary;
}
