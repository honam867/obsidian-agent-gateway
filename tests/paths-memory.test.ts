import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { makeVaultPaths } from "../src/vault/paths.js";

const root = path.resolve("/vault");
const p = makeVaultPaths("/vault");

test("feature working paths", () => {
  assert.equal(p.featureWorkingDir("misa-payout"), path.join(root, "features", "misa-payout", "working"));
  assert.equal(
    p.featureCurrentFile("misa-payout"),
    path.join(root, "features", "misa-payout", "working", "current.md"),
  );
});

test("repo knowledge paths", () => {
  assert.equal(p.repoKnowledgeDir("cozrum-server"), path.join(root, "repos", "cozrum-server", "knowledge"));
  assert.equal(
    p.repoKnowledgeFile("cozrum-server", "misa-prepare"),
    path.join(root, "repos", "cozrum-server", "knowledge", "misa-prepare.md"),
  );
});

test("instinct file path", () => {
  assert.equal(p.instinctFile("forward-slash-paths"), path.join(root, "global", "instincts", "forward-slash-paths.md"));
});
