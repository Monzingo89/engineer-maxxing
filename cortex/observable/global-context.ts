import fs from "fs";
import path from "path";
import {
  RepoBrainState,
  ContainerObservation,
  RepoTaskProgress,
  SubRepoFinding,
  SymbolInventory,
  DependencyAuditFindings,
  ArchitecturePatternFindings,
  createInitialRepoBrainState,
  hydrateRepoBrainState
} from "../context/repo-brain.store.js";
import { RepoEvent } from "../context/repo-event.types.js";
import { RepoMemoryFile } from "../enums/repo-memory-file.enum.js";
import { ModelId } from "../enums/model.enum.js";
import { WorkUnit } from "../enums/work-unit.enum.js";
import { ContainerPlatform } from "../enums/container-platform.enum.js";
import { RepoTask } from "../enums/repo-task.enum.js";
import { RepoAuthorshipModel } from "../enums/repo-authorship-model.enum.js";

function getContextPath() {
  return path.join(process.cwd(), ".cortex", "context.json");
}

type Listener = (state: RepoBrainState) => void;

class GlobalContextStore {
  private listeners: Listener[] = [];

  private ensureContextDirectory() {
    fs.mkdirSync(path.dirname(getContextPath()), { recursive: true });
  }

  get(): RepoBrainState {
    const contextPath = getContextPath();

    if (!fs.existsSync(contextPath)) {
      return createInitialRepoBrainState(process.cwd());
    }

    const parsed = JSON.parse(fs.readFileSync(contextPath, "utf8"));
    return hydrateRepoBrainState(parsed, process.cwd());
  }

  set(state: RepoBrainState) {
    this.ensureContextDirectory();
    const contextPath = getContextPath();
    const hydrated = hydrateRepoBrainState(state, process.cwd());
    fs.writeFileSync(contextPath, JSON.stringify(hydrated, null, 2), "utf8");
    this.listeners.forEach((listener) => listener(hydrated));
  }

  subscribe(listener: Listener) {
    this.listeners.push(listener);
    listener(this.get());

    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener);
    };
  }

  pushEvent(event: RepoEvent) {
    const state = this.get();

    const next = {
      ...state,
      eyes: event.targetFile === RepoMemoryFile.EYES ? [...state.eyes, event] : state.eyes,
      nose: event.targetFile === RepoMemoryFile.NOSE ? [...state.nose, event] : state.nose,
      ears: event.targetFile === RepoMemoryFile.EARS ? [...state.ears, event] : state.ears,
      hands: event.targetFile === RepoMemoryFile.HANDS ? [...state.hands, event] : state.hands,
      brain: event.targetFile === RepoMemoryFile.BRAIN ? [...state.brain, event] : state.brain
    };

    this.set(next);
  }

  setActiveWork(input: {
    directory?: string;
    file?: string;
    model?: ModelId;
    step?: WorkUnit;
  }) {
    const state = this.get();

    this.set({
      ...state,
      activeContext: {
        ...state.activeContext,
        activeDirectory: input.directory ?? state.activeContext.activeDirectory,
        activeFile: input.file ?? state.activeContext.activeFile,
        activeModel: input.model ?? state.activeContext.activeModel,
        activeStep: input.step ?? state.activeContext.activeStep
      }
    });
  }

  updateProgress(input: {
    totalFiles?: number;
    scannedFiles?: number;
    totalDirectories?: number;
    scannedDirectories?: number;
  }) {
    const state = this.get();
    const progress = {
      ...state.activeContext.progress,
      ...input
    };

    const percentComplete =
      progress.totalFiles > 0
        ? Math.round((progress.scannedFiles / progress.totalFiles) * 100)
        : 0;

    this.set({
      ...state,
      activeContext: {
        ...state.activeContext,
        remainingFiles: Math.max(0, progress.totalFiles - progress.scannedFiles),
        progress: {
          ...progress,
          percentComplete
        }
      }
    });
  }

  setTaskProgress(task: RepoTask, input: Partial<RepoTaskProgress>) {
    const state = this.get();
    const current = state.activeContext.tasks[task];
    const nextBase = {
      ...current,
      ...input,
      updatedAt: new Date().toISOString()
    };

    const totalItems = Number.isFinite(nextBase.totalItems) ? Math.max(0, nextBase.totalItems) : 0;
    const completedItems = Number.isFinite(nextBase.completedItems)
      ? Math.max(0, Math.min(nextBase.completedItems, totalItems || Number.MAX_SAFE_INTEGER))
      : 0;
    const remainingItems = Math.max(0, totalItems - completedItems);
    const percentComplete = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    this.set({
      ...state,
      activeContext: {
        ...state.activeContext,
        tasks: {
          ...state.activeContext.tasks,
          [task]: {
            ...nextBase,
            totalItems,
            completedItems,
            remainingItems,
            percentComplete
          }
        }
      }
    });
  }

  setRepoAuthoringModels(models: RepoAuthorshipModel[]) {
    const state = this.get();
    const uniqueModels = Array.from(new Set(models));

    this.set({
      ...state,
      activeContext: {
        ...state.activeContext,
        repoAuthoringModels: uniqueModels
      }
    });
  }

  recordContainerObservation(platform: ContainerPlatform, evidencePath: string) {
    const state = this.get();
    const existing = state.activeContext.containers[platform] as ContainerObservation | undefined;
    const now = new Date().toISOString();

    const next: ContainerObservation = existing
      ? {
          ...existing,
          evidencePaths: Array.from(new Set([...existing.evidencePaths, evidencePath])),
          lastDetectedAt: now
        }
      : {
          platform,
          evidencePaths: [evidencePath],
          firstDetectedAt: now,
          lastDetectedAt: now
        };

    this.set({
      ...state,
      activeContext: {
        ...state.activeContext,
        containers: {
          ...state.activeContext.containers,
          [platform]: next
        }
      }
    });
  }

  recordFileAuthorship(model: RepoAuthorshipModel) {
    const state = this.get();
    const existing = state.activeContext.fileAuthorshipCounts[model] || 0;

    this.set({
      ...state,
      activeContext: {
        ...state.activeContext,
        fileAuthorshipCounts: {
          ...state.activeContext.fileAuthorshipCounts,
          [model]: existing + 1
        }
      }
    });
  }

  setLastCompletedFile(filePath: string) {
    const state = this.get();

    this.set({
      ...state,
      activeContext: {
        ...state.activeContext,
        lastCompletedFile: filePath
      }
    });
  }

  setLastHandoff(fromModel: ModelId, toModel: ModelId) {
    const state = this.get();

    this.set({
      ...state,
      activeContext: {
        ...state.activeContext,
        lastHandoff: {
          fromModel,
          toModel,
          at: new Date().toISOString()
        }
      }
    });
  }

  updateLearned(input: Partial<RepoBrainState["learned"]>) {
    const state = this.get();
    const nextLearned = {
      ...state.learned,
      ...input
    };

    const learnedKeys = Object.keys(nextLearned) as Array<keyof RepoBrainState["learned"]>;

    for (const key of learnedKeys) {
      const currentValue = state.learned[key];
      const incomingValue = nextLearned[key];

      if (Array.isArray(currentValue) && Array.isArray(incomingValue)) {
        nextLearned[key] = Array.from(new Set([...currentValue, ...incomingValue])) as never;
      }
    }

    this.set({
      ...state,
      learned: nextLearned
    });
  }

  setSubRepos(subRepos: SubRepoFinding[]) {
    const state = this.get();
    this.set({
      ...state,
      learned: { ...state.learned, subRepos }
    });
  }

  setDeadCodeCandidates(deadCodeCandidates: string[]) {
    const state = this.get();
    this.set({
      ...state,
      learned: { ...state.learned, deadCodeCandidates }
    });
  }

  setSymbolInventory(symbolInventory: SymbolInventory) {
    const state = this.get();
    this.set({
      ...state,
      learned: { ...state.learned, symbolInventory }
    });
  }

  setDependencyAudit(dependencyAudit: DependencyAuditFindings) {
    const state = this.get();
    this.set({
      ...state,
      learned: { ...state.learned, dependencyAudit }
    });
  }

  setArchitecturePatterns(architecturePatterns: ArchitecturePatternFindings) {
    const state = this.get();
    this.set({
      ...state,
      learned: { ...state.learned, architecturePatterns }
    });
  }

  markSaved() {
    const state = this.get();
    this.set({
      ...state,
      learned: { ...state.learned, lastSavedAt: new Date().toISOString() }
    });
  }
}

export const GlobalContext = new GlobalContextStore();
