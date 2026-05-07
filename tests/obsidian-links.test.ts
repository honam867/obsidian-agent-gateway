import { test } from "node:test";
import assert from "node:assert/strict";
import { upsertTaskLinks } from "../src/domain/obsidian-links.js";
import type { TaskFrontmatter } from "../src/schemas/task.js";

function task(overrides: Partial<TaskFrontmatter> = {}): TaskFrontmatter {
  return {
    id: "002-build-api",
    title: "Build API",
    project: "go-viral",
    plan: "2026-05-07-graph-links",
    status: "active",
    session: null,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
    started_at: null,
    completed_at: null,
    depends_on: ["001-schema"],
    tags: [],
    block_reason: null,
    version: 1,
    review_verdict: "none",
    review_session: null,
    ...overrides,
  };
}

test("task link block links project, plan, status, and dependencies", () => {
  const body = upsertTaskLinks("# Build API\n\nAcceptance details.", task());

  assert.match(body, /\[\[projects\/go-viral\/go-viral\|go-viral\]\]/);
  assert.match(body, /\[\[projects\/go-viral\/plans\/2026-05-07-graph-links\/2026-05-07-graph-links\|2026-05-07-graph-links\]\]/);
  assert.match(body, /\[\[_index\/status\/active\|active\]\]/);
  assert.match(body, /\[\[projects\/go-viral\/plans\/2026-05-07-graph-links\/tasks\/001-schema\|001-schema\]\]/);
});

test("task link block is idempotent", () => {
  const first = upsertTaskLinks("# Build API\n\nAcceptance details.", task());
  const second = upsertTaskLinks(first, task({ status: "blocked" }));

  assert.equal((second.match(/agent-gateway-links:start/g) ?? []).length, 1);
  assert.match(second, /\[\[_index\/status\/blocked\|blocked\]\]/);
  assert.doesNotMatch(second, /\[\[_index\/status\/active\|active\]\]/);
});
