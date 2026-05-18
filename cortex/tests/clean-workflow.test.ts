import assert from "node:assert/strict";
import test from "node:test";
import { buildCleanupPlanMarkdown } from "../workflows/clean.workflow.js";

test("buildCleanupPlanMarkdown includes key cleanup phases and findings", () => {
  const markdown = buildCleanupPlanMarkdown({
    generatedAtIso: "2026-05-18T00:00:00.000Z",
    secretSignals: ["apps/api/local.settings.json: PRIVATE_KEY_BLOCK"],
    deadCodeCandidates: ["scripts/old-task.ts", "src/legacy/handler.ts"],
    deadCodeQueuePath: "anatomy/CLEANUP_DEAD_CODE_QUEUE.txt",
    deadCodeSampleSize: 10,
    unusedRuntimeDependencies: ["zod"],
    heavyDependencies: ["playwright"],
    learnTaskStatus: "completed"
  });

  assert.match(markdown, /# CLEANUP_PLAN\.md/);
  assert.match(markdown, /## Phase 0 — Security first \(blocker\)/);
  assert.match(markdown, /## Phase 1 — Dependency hygiene/);
  assert.match(markdown, /## Phase 2 — Dead code triage/);
  assert.match(markdown, /apps\/api\/local\.settings\.json: PRIVATE_KEY_BLOCK/);
  assert.match(markdown, /- zod/);
  assert.match(markdown, /- playwright/);
  assert.match(markdown, /anatomy\/CLEANUP_DEAD_CODE_QUEUE\.txt/);
});

test("buildCleanupPlanMarkdown handles empty findings", () => {
  const markdown = buildCleanupPlanMarkdown({
    generatedAtIso: "2026-05-18T00:00:00.000Z",
    secretSignals: [],
    deadCodeCandidates: [],
    deadCodeSampleSize: 10,
    unusedRuntimeDependencies: [],
    heavyDependencies: [],
    learnTaskStatus: "completed"
  });

  assert.match(markdown, /No secret exposure signals detected in current anatomy\./);
  assert.match(markdown, /No dependency cleanup items detected\./);
  assert.match(markdown, /No dead-code candidates detected\./);
});
