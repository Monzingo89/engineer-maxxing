import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReorganizePlanMarkdown,
  parseTechnologyDocsFromSoul
} from "../workflows/reorganize.workflow.js";

test("parseTechnologyDocsFromSoul extracts technology links from SOUL section", () => {
  const soul = `# SOUL\n\n## Technology documentation\n- TypeScript: https://www.typescriptlang.org/docs/\n- Node.js: https://nodejs.org/docs/latest-v22.x/api/\n\n## Other section\n- Something else`;

  const docs = parseTechnologyDocsFromSoul(soul);

  assert.equal(docs.length, 2);
  assert.deepEqual(docs[0], {
    name: "Node.js",
    url: "https://nodejs.org/docs/latest-v22.x/api/"
  });
  assert.deepEqual(docs[1], {
    name: "TypeScript",
    url: "https://www.typescriptlang.org/docs/"
  });
});

test("buildReorganizePlanMarkdown includes standard sections and paths", () => {
  const markdown = buildReorganizePlanMarkdown({
    generatedAtIso: "2026-05-18T00:00:00.000Z",
    learnTaskStatus: "completed",
    cleanTaskStatus: "in_progress",
    technologyDocs: [
      { name: "TypeScript", url: "https://www.typescriptlang.org/docs/" }
    ],
    technologyNames: ["TypeScript", "Node.js"],
    srpSignals: ["apps/api/src/handlers/orders.ts"],
    directoryPressure: [{ directory: "apps/api/src/handlers", fileCount: 22 }],
    moveMapPath: "anatomy/REORGANIZE_MOVE_MAP.md",
    srpSampleSize: 10,
    profile: {
      hasTypeScript: true,
      hasJavaScript: false,
      hasNode: true,
      hasReact: false,
      hasPython: false,
      hasContainerSignals: true
    }
  });

  assert.match(markdown, /# REORGANIZE_PLAN\.md/);
  assert.match(markdown, /## Industry-standard target structure/);
  assert.match(markdown, /## Technology docs used from SOUL\.md/);
  assert.match(markdown, /apps\/api\/src\/handlers\/orders\.ts/);
  assert.match(markdown, /anatomy\/REORGANIZE_MOVE_MAP\.md/);
  assert.match(markdown, /infra\/\{docker,kubernetes,terraform\}/);
});
