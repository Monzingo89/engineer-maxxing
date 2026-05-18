import fs from "fs";
import path from "path";
import chalk from "chalk";
import { RepoBrainState } from "../context/repo-brain.store.js";
import { createRepoEvent } from "../events/event-factory.js";
import { RepoEventType } from "../enums/repo-event-type.enum.js";
import { RepoMemoryFile } from "../enums/repo-memory-file.enum.js";
import { RepoTask } from "../enums/repo-task.enum.js";
import { GlobalContext } from "../observable/global-context.js";
import {
  appendBrainText,
  appendOrganEvent,
  ensureAnatomyFilesExist,
  writeAnatomyFile
} from "../writers/organ-writer.js";

export type ReorganizeRepoOptions = {
  quiet: boolean;
  srpSampleSize: number;
  moveMapLimit: number;
};

export type ReorganizeRepoSummary = {
  repoRoot: string;
  planPath: string;
  moveMapPath: string;
  heartPath: string;
  simplifyTaskStatus: "not_started" | "in_progress" | "completed";
  srpSignalCount: number;
  directoryPressureCount: number;
  technologyDocCount: number;
  suggestedMoveCount: number;
  generatedAt: string;
};

export type TechnologyDocLink = {
  name: string;
  url: string;
};

type StackProfile = {
  hasTypeScript: boolean;
  hasJavaScript: boolean;
  hasNode: boolean;
  hasReact: boolean;
  hasPython: boolean;
  hasContainerSignals: boolean;
};

const DEFAULT_REORGANIZE_OPTIONS: ReorganizeRepoOptions = {
  quiet: false,
  srpSampleSize: 40,
  moveMapLimit: 220
};

function resolveReorganizeOptions(input?: Partial<ReorganizeRepoOptions>): ReorganizeRepoOptions {
  const merged = {
    ...DEFAULT_REORGANIZE_OPTIONS,
    ...(input || {})
  };

  const srpSampleSize = Number.isFinite(merged.srpSampleSize)
    ? Math.max(1, Math.floor(merged.srpSampleSize))
    : DEFAULT_REORGANIZE_OPTIONS.srpSampleSize;

  const moveMapLimit = Number.isFinite(merged.moveMapLimit)
    ? Math.max(25, Math.floor(merged.moveMapLimit))
    : DEFAULT_REORGANIZE_OPTIONS.moveMapLimit;

  return {
    ...merged,
    srpSampleSize,
    moveMapLimit
  };
}

function uniqueSorted(items: string[]): string[] {
  return Array.from(new Set(items)).sort((a, b) => a.localeCompare(b));
}

function sectionBetween(content: string, heading: string): string {
  const startPattern = new RegExp(`^##\\s+${heading}\\s*$`, "m");
  const startMatch = startPattern.exec(content);
  if (!startMatch || startMatch.index === undefined) return "";

  const afterStart = content.slice(startMatch.index + startMatch[0].length);
  const nextHeadingMatch = /^##\s+/m.exec(afterStart);

  return nextHeadingMatch
    ? afterStart.slice(0, nextHeadingMatch.index).trim()
    : afterStart.trim();
}

export function parseTechnologyDocsFromSoul(soulMarkdown: string): TechnologyDocLink[] {
  const section = sectionBetween(soulMarkdown, "Technology documentation");
  const source = section || soulMarkdown;

  const links: TechnologyDocLink[] = [];
  const lines = source.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = /^-\s+([^:]+):\s+(https?:\/\/\S+)$/i.exec(line);
    if (!match) continue;

    links.push({
      name: match[1].trim(),
      url: match[2].trim()
    });
  }

  return uniqueSorted(links.map((item) => `${item.name}|${item.url}`)).map((entry) => {
    const [name, url] = entry.split("|");
    return { name, url };
  });
}

function readTechnologyDocsFromSoul(repoRoot: string): TechnologyDocLink[] {
  const soulPath = path.join(repoRoot, RepoMemoryFile.SOUL);
  if (!fs.existsSync(soulPath)) return [];
  return parseTechnologyDocsFromSoul(fs.readFileSync(soulPath, "utf8"));
}

function collectObservedFiles(state: RepoBrainState): string[] {
  const files: string[] = [];

  for (const event of state.eyes) {
    if (event.type !== RepoEventType.FILE_OBSERVED) continue;
    if (!event.sourcePath) continue;
    files.push(event.sourcePath);
  }

  return uniqueSorted(files);
}

function collectSingleResponsibilitySignals(state: RepoBrainState): string[] {
  const srpSignals: string[] = [];

  for (const event of state.nose) {
    if (
      event.type !== RepoEventType.BREAKS_SINGLE_RESPONSIBILITY &&
      event.type !== RepoEventType.CODE_SMELL_DETECTED
    ) {
      continue;
    }

    if (event.sourcePath) {
      srpSignals.push(event.sourcePath);
    }

    for (const evidenceLine of event.evidence) {
      if (evidenceLine.includes("/")) {
        srpSignals.push(evidenceLine.replace(/^-\s*/, "").trim());
      }
    }
  }

  return uniqueSorted(srpSignals);
}

function collectDirectoryPressure(files: string[]): Array<{ directory: string; fileCount: number }> {
  const counts = new Map<string, number>();

  for (const filePath of files) {
    const directory = path.dirname(filePath);
    counts.set(directory, (counts.get(directory) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([directory, fileCount]) => ({ directory, fileCount }))
    .filter((item) => item.fileCount >= 12)
    .sort((a, b) => b.fileCount - a.fileCount || a.directory.localeCompare(b.directory));
}

function inferStackProfile(technologyNames: string[], state: RepoBrainState): StackProfile {
  const normalized = technologyNames.map((name) => name.toLowerCase());

  return {
    hasTypeScript: normalized.some((name) => name.includes("typescript")),
    hasJavaScript: normalized.some((name) => name.includes("javascript")),
    hasNode: normalized.some((name) => name.includes("node")),
    hasReact: normalized.some((name) => name.includes("react")),
    hasPython: normalized.some((name) => name.includes("python")),
    hasContainerSignals: Object.keys(state.activeContext.containers || {}).length > 0
  };
}

function suggestDestinationPath(sourcePath: string, profile: StackProfile): string {
  const ext = path.extname(sourcePath);
  const normalized = sourcePath.toLowerCase();

  if (/\/(test|tests)\//.test(normalized) || /\.(test|spec)\.[a-z0-9]+$/i.test(normalized)) {
    return `tests/${path.basename(sourcePath)}`;
  }

  if (/\/(script|scripts)\//.test(normalized)) {
    return `scripts/${path.basename(sourcePath)}`;
  }

  if (/\/(handler|handlers|api|routes|functions)\//.test(normalized)) {
    return `apps/api/src/modules/<domain>/${path.basename(sourcePath)}`;
  }

  if (/\/(component|components|page|pages|view|views|feature|features)\//.test(normalized)) {
    return `apps/web/src/features/<feature>/${path.basename(sourcePath)}`;
  }

  if (/\/(lib|utils|helpers|shared)\//.test(normalized)) {
    return `packages/shared/src/${path.basename(sourcePath)}`;
  }

  if (profile.hasPython && ext === ".py") {
    return `services/<service>/src/${path.basename(sourcePath)}`;
  }

  if ((profile.hasTypeScript || profile.hasJavaScript) && [".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    return `packages/<bounded-context>/src/${path.basename(sourcePath)}`;
  }

  return `docs/migrations/${path.basename(sourcePath)}`;
}

function buildMoveSuggestions(
  files: string[],
  srpSignals: string[],
  directoryPressure: Array<{ directory: string; fileCount: number }>,
  profile: StackProfile,
  limit: number
): Array<{ source: string; target: string; reason: string }> {
  const suggestions: Array<{ source: string; target: string; reason: string }> = [];
  const priorityFiles = new Set<string>(srpSignals);

  for (const pressure of directoryPressure.slice(0, 8)) {
    for (const candidate of files) {
      if (path.dirname(candidate) === pressure.directory) {
        priorityFiles.add(candidate);
      }
    }
  }

  const orderedCandidates = uniqueSorted([...priorityFiles, ...files]);

  for (const source of orderedCandidates) {
    if (suggestions.length >= limit) break;

    const target = suggestDestinationPath(source, profile);

    if (target.endsWith(path.basename(source)) && source.endsWith(path.basename(source))) {
      suggestions.push({
        source,
        target,
        reason: srpSignals.includes(source)
          ? "Single-responsibility split candidate"
          : "Structure normalization"
      });
    }
  }

  return suggestions;
}

function writeMoveMapFile(
  repoRoot: string,
  suggestions: Array<{ source: string; target: string; reason: string }>
): string {
  const relativePath = "anatomy/REORGANIZE_MOVE_MAP.md";
  const absolutePath = path.join(repoRoot, relativePath);

  const lines: string[] = [];
  lines.push("# REORGANIZE_MOVE_MAP.md");
  lines.push("");
  lines.push("Suggested move/split map generated from anatomy. Apply incrementally and verify tests after each batch.");
  lines.push("");
  lines.push("| Source | Suggested target | Reason |");
  lines.push("|---|---|---|");

  if (suggestions.length === 0) {
    lines.push("| _none_ | _none_ | No move candidates generated | ");
  } else {
    for (const item of suggestions) {
      lines.push(`| \`${item.source}\` | \`${item.target}\` | ${item.reason} |`);
    }
  }

  fs.writeFileSync(absolutePath, `${lines.join("\n")}\n`, "utf8");

  return relativePath;
}

function buildIndustryLayout(profile: StackProfile): string[] {
  const lines: string[] = [];

  lines.push("```text");
  lines.push("apps/");

  if (profile.hasNode || profile.hasTypeScript || profile.hasJavaScript) {
    lines.push("  api/");
    lines.push("    src/modules/<domain>/{controllers,services,repositories,schemas}");
    lines.push("    src/framework/{http,config,observability}");
  }

  if (profile.hasReact || profile.hasTypeScript || profile.hasJavaScript) {
    lines.push("  web/");
    lines.push("    src/features/<feature>/{components,hooks,services,state}");
    lines.push("    src/shared/{ui,utils,types}");
  }

  if (profile.hasPython) {
    lines.push("services/");
    lines.push("  <service>/src/{api,domain,infra}");
  }

  lines.push("packages/");
  lines.push("  shared/src/{domain,application,infra}");
  lines.push("scripts/");
  lines.push("tests/{unit,integration,e2e}");

  if (profile.hasContainerSignals) {
    lines.push("infra/{docker,kubernetes,terraform}");
  }

  lines.push("docs/{architecture,runbooks,migrations}");
  lines.push("```;");

  const fixed = lines[lines.length - 1] === "```;" ? lines.slice(0, -1).concat("```") : lines;
  return fixed;
}

export function buildReorganizePlanMarkdown(input: {
  generatedAtIso: string;
  learnTaskStatus: string;
  cleanTaskStatus: string;
  technologyDocs: TechnologyDocLink[];
  technologyNames: string[];
  srpSignals: string[];
  directoryPressure: Array<{ directory: string; fileCount: number }>;
  moveMapPath: string;
  srpSampleSize: number;
  profile: StackProfile;
}): string {
  const lines: string[] = [];

  lines.push("# REORGANIZE_PLAN.md");
  lines.push("");
  lines.push("Reorganization plan generated from anatomy outputs (LEARN_REPO + CLEAN_REPO) and SOUL technology docs.");
  lines.push("");
  lines.push(`- Generated at: ${input.generatedAtIso}`);
  lines.push(`- LEARN_REPO status: \`${input.learnTaskStatus}\``);
  lines.push(`- CLEAN_REPO status: \`${input.cleanTaskStatus}\``);
  lines.push(`- SOUL technology docs parsed: **${input.technologyDocs.length}**`);
  lines.push(`- Single-responsibility signals: **${input.srpSignals.length}**`);
  lines.push(`- High-pressure directories: **${input.directoryPressure.length}**`);
  lines.push(`- Move map: \`${input.moveMapPath}\``);
  lines.push("");

  lines.push("## Industry-standard target structure");
  lines.push("");
  lines.push(...buildIndustryLayout(input.profile));
  lines.push("");

  lines.push("## Technology docs used from SOUL.md");
  lines.push("");
  if (input.technologyDocs.length === 0) {
    lines.push("- No SOUL technology docs were found. Re-run LEARN_REPO if SOUL is stale.");
  } else {
    lines.push(...input.technologyDocs.map((doc) => `- ${doc.name}: ${doc.url}`));
  }

  lines.push("");
  lines.push("## Single-responsibility split queue");
  lines.push("");
  if (input.srpSignals.length === 0) {
    lines.push("- No explicit SRP violations detected. Use directory-pressure list to prioritize modularization.");
  } else {
    lines.push(
      ...input.srpSignals
        .slice(0, input.srpSampleSize)
        .map((item) => `- ${item}`)
    );
  }

  lines.push("");
  lines.push("## Directory-pressure hotspots");
  lines.push("");
  if (input.directoryPressure.length === 0) {
    lines.push("- No hotspots crossed the threshold.");
  } else {
    lines.push(...input.directoryPressure.slice(0, 20).map((item) => `- ${item.directory} (${item.fileCount} files)`));
  }

  lines.push("");
  lines.push("## Reorganization execution phases");
  lines.push("");
  lines.push("1. Create target folder layout without moving files yet.");
  lines.push("2. Move SRP queue files in small batches; update imports immediately per batch.");
  lines.push("3. Move shared helpers into `packages/shared` and remove duplicate utility logic.");
  lines.push("4. Re-run tests/build/lint after each batch.");
  lines.push("5. Re-run `learn` + `clean-repo` + `reorganize-repo` to refresh anatomy and next actions.");

  if (input.technologyNames.length > 0) {
    lines.push("");
    lines.push("## Detected stack snapshot");
    lines.push("");
    lines.push(`- ${input.technologyNames.join(", ")}`);
  }

  return `${lines.join("\n")}\n`;
}

function buildHeartReorganizationMarkdown(input: {
  technologyNames: string[];
  moveMapPath: string;
  planPath: string;
  srpSignals: string[];
}): string {
  const lines: string[] = [];

  lines.push("# HEART.md");
  lines.push("");
  lines.push("> HEART plans reorganization work across visual, frontend, backend, database, and infrastructure so the repo converges on industry-standard structure.");
  lines.push("");

  lines.push("## Visual Changes (Markup)");
  lines.push("- Extract shared UI markup into feature-scoped component folders where applicable.");
  lines.push("- Acceptance criteria: no duplicated page-level markup helpers in unrelated features.");
  lines.push("");

  lines.push("## Frontend Changes (Components, Modules, Services, State)");
  lines.push("- Re-home frontend files to `apps/web/src/features/<feature>` and `apps/web/src/shared`.");
  lines.push("- Split mixed component/service/state files into single-purpose modules.");
  lines.push("- Acceptance criteria: one primary concern per file; no cross-feature utility drift.");
  lines.push("");

  lines.push("## Backend Changes (API, SOAP, OTHER)");
  lines.push("- Re-home backend handlers/routes into `apps/api/src/modules/<domain>`.");
  lines.push("- Separate transport adapters from business logic (controller/service/repository boundaries).");
  lines.push("- Acceptance criteria: handlers are thin, business logic in services, persistence in repositories.");
  lines.push("");

  lines.push("## Database Changes (Schema, Migrations, Queries, Indexes, Security, Performance)");
  lines.push("- Centralize migrations and data access primitives by domain.");
  lines.push("- Ensure query modules are not mixed with transport/controller concerns.");
  lines.push("- Acceptance criteria: database concerns remain behind explicit repository/data-access boundaries.");
  lines.push("");

  lines.push("## Infrastructure Changes (Helpers, Extensions, Shared, Repository, Factory)");
  lines.push("- Move shared cross-cutting helpers into `packages/shared`.");
  lines.push("- Keep infra config in `infra/` and operational docs in `docs/runbooks`.");
  lines.push("- Acceptance criteria: predictable folder ownership and minimal hidden coupling.");
  lines.push("");

  lines.push("## Reorganization Inputs");
  lines.push(`- Plan: \`${input.planPath}\``);
  lines.push(`- Move map: \`${input.moveMapPath}\``);
  lines.push(`- SRP queue size: ${input.srpSignals.length}`);
  lines.push(`- Technology snapshot: ${input.technologyNames.join(", ") || "none detected"}`);

  return `${lines.join("\n")}\n`;
}

export async function reorganizeRepo(
  repoRoot: string,
  inputOptions?: Partial<ReorganizeRepoOptions>
): Promise<ReorganizeRepoSummary> {
  const options = resolveReorganizeOptions(inputOptions);
  ensureAnatomyFilesExist();

  const contextPath = path.join(repoRoot, ".cortex", "context.json");
  if (!fs.existsSync(contextPath)) {
    throw new Error(
      "No .cortex/context.json found for this repository. Run LEARN_REPO first with `npx @monzingo89/engineer-maxxing --fresh`."
    );
  }

  const state = GlobalContext.get();
  const learnTask = state.activeContext.tasks[RepoTask.LEARN_REPO];
  const cleanTask = state.activeContext.tasks[RepoTask.CLEAN_REPO];

  const technologyNames = uniqueSorted(state.learned.technologies || []);
  const technologyDocs = readTechnologyDocsFromSoul(repoRoot);
  const srpSignals = collectSingleResponsibilitySignals(state);
  const observedFiles = collectObservedFiles(state);
  const directoryPressure = collectDirectoryPressure(observedFiles);
  const profile = inferStackProfile(technologyNames, state);

  const moveSuggestions = buildMoveSuggestions(
    observedFiles,
    srpSignals,
    directoryPressure,
    profile,
    options.moveMapLimit
  );

  const moveMapPath = writeMoveMapFile(repoRoot, moveSuggestions);

  const generatedAtIso = new Date().toISOString();
  const planPath = "anatomy/REORGANIZE_PLAN.md";

  const planMarkdown = buildReorganizePlanMarkdown({
    generatedAtIso,
    learnTaskStatus: learnTask.status,
    cleanTaskStatus: cleanTask.status,
    technologyDocs,
    technologyNames,
    srpSignals,
    directoryPressure,
    moveMapPath,
    srpSampleSize: options.srpSampleSize,
    profile
  });

  fs.writeFileSync(path.join(repoRoot, planPath), planMarkdown, "utf8");

  const heartPath = RepoMemoryFile.HEART;
  const heartMarkdown = buildHeartReorganizationMarkdown({
    technologyNames,
    moveMapPath,
    planPath,
    srpSignals
  });
  writeAnatomyFile(RepoMemoryFile.HEART, heartMarkdown);

  appendBrainText(
    "Next Recommended Reorganization Actions",
    [
      `- Reorganization plan generated: \`${planPath}\``,
      `- Move map generated: \`${moveMapPath}\``,
      "- Execute moves in small batches and keep imports passing after each batch.",
      "- Re-run LEARN_REPO and CLEAN_REPO after each reorganization phase."
    ].join("\n")
  );

  const hasReorgFindings = srpSignals.length > 0 || directoryPressure.length > 0 || moveSuggestions.length > 0;
  const simplifyTaskStatus: "in_progress" | "completed" = hasReorgFindings ? "in_progress" : "completed";

  GlobalContext.setTaskProgress(RepoTask.SIMPLIFY_REPO, {
    status: simplifyTaskStatus,
    totalItems: Math.max(1, srpSignals.length + directoryPressure.length),
    completedItems: hasReorgFindings ? 1 : Math.max(1, srpSignals.length + directoryPressure.length),
    note: hasReorgFindings
      ? "Reorganization plan generated. Execute modularization/move batches and regenerate plan as structure improves."
      : "No reorganization findings remain."
  });

  const earsEvent = createRepoEvent({
    type: RepoEventType.NOISE_DETECTED,
    targetFile: RepoMemoryFile.EARS,
    title: "Reorganization opportunities identified",
    summary: "Directory pressure and SRP signals were translated into a concrete reorganization plan.",
    evidence: [
      `srp signals: ${srpSignals.length}`,
      `directory hotspots: ${directoryPressure.length}`,
      `move suggestions: ${moveSuggestions.length}`,
      `plan: ${planPath}`,
      `move map: ${moveMapPath}`
    ],
    severity: hasReorgFindings ? "medium" : "info",
    confidence: "high"
  });
  GlobalContext.pushEvent(earsEvent);
  appendOrganEvent(earsEvent);

  const heartEvent = createRepoEvent({
    type: RepoEventType.HEART_PLAN_GENERATED,
    targetFile: RepoMemoryFile.HEART,
    title: "HEART reorganization plan generated",
    summary: "HEART now contains a repo reorganization plan across visual/frontend/backend/database/infrastructure sections.",
    evidence: [`heart path: ${heartPath}`, `plan path: ${planPath}`, `move map path: ${moveMapPath}`],
    severity: "info",
    confidence: "high"
  });
  GlobalContext.pushEvent(heartEvent);
  appendOrganEvent(heartEvent);

  const taskEvent = createRepoEvent({
    type: RepoEventType.TASK_PROGRESS_UPDATED,
    targetFile: RepoMemoryFile.HANDS,
    title: hasReorgFindings ? "Task updated: SIMPLIFY_REPO" : "Task completed: SIMPLIFY_REPO",
    summary: hasReorgFindings
      ? "Reorganization artifacts were generated. Execute move/split batches to complete simplification."
      : "No reorganize findings detected; SIMPLIFY_REPO is complete.",
    evidence: [
      `plan: ${planPath}`,
      `move map: ${moveMapPath}`,
      `srp signals: ${srpSignals.length}`,
      `directory pressure: ${directoryPressure.length}`,
      `technology docs: ${technologyDocs.length}`
    ],
    severity: hasReorgFindings ? "medium" : "info",
    confidence: "high"
  });
  GlobalContext.pushEvent(taskEvent);
  appendOrganEvent(taskEvent);

  const summary: ReorganizeRepoSummary = {
    repoRoot,
    planPath,
    moveMapPath,
    heartPath,
    simplifyTaskStatus,
    srpSignalCount: srpSignals.length,
    directoryPressureCount: directoryPressure.length,
    technologyDocCount: technologyDocs.length,
    suggestedMoveCount: moveSuggestions.length,
    generatedAt: generatedAtIso
  };

  if (!options.quiet) {
    console.log(chalk.cyan("REORGANIZE_REPO plan generated."));
    console.log(`- Plan: ${summary.planPath}`);
    console.log(`- Move map: ${summary.moveMapPath}`);
    console.log(`- HEART updated: ${summary.heartPath}`);
    console.log(`- SRP signals: ${summary.srpSignalCount}`);
    console.log(`- Directory hotspots: ${summary.directoryPressureCount}`);
    console.log(`- Technology docs from SOUL: ${summary.technologyDocCount}`);
    console.log("Next: execute one move/split batch, run tests, then re-run learn + clean + reorganize.");
  }

  return summary;
}
