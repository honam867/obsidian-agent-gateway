import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { makeVaultPaths } from "../src/vault/paths.js";
import { loadConfig } from "../src/config.js";

const root = path.resolve("/vault");
const p = makeVaultPaths("/vault");

test("lesson paths", () => {
  assert.equal(p.repoLessonsDir("cozrum-server"), path.join(root, "repos", "cozrum-server", "lessons"));
  assert.equal(
    p.repoLessonFile("cozrum-server", "cash-remap"),
    path.join(root, "repos", "cozrum-server", "lessons", "cash-remap.md"),
  );
});

test("playbook paths", () => {
  assert.equal(p.repoPlaybooksDir("cozrum-server"), path.join(root, "repos", "cozrum-server", "playbooks"));
  assert.equal(
    p.repoPlaybookFile("cozrum-server", "run-script"),
    path.join(root, "repos", "cozrum-server", "playbooks", "run-script.md"),
  );
});

test("config has a learn threshold defaulting to 2", () => {
  delete process.env.AGENT_GATEWAY_LEARN_THRESHOLD;
  assert.equal(loadConfig().learnThreshold, 2);
});
