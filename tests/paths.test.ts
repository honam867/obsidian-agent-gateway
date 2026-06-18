import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { makeVaultPaths } from "../src/vault/paths.js";

const root = path.resolve("/vault");
const p = makeVaultPaths("/vault");

test("workspaceIndexFile lives under _index", () => {
  assert.equal(p.workspaceIndexFile, path.join(root, "_index", "workspace.json"));
});

test("feature paths", () => {
  assert.equal(p.featuresDir, path.join(root, "features"));
  assert.equal(p.featureDir("misa-payout"), path.join(root, "features", "misa-payout"));
  assert.equal(
    p.featureFile("misa-payout"),
    path.join(root, "features", "misa-payout", "_feature.md"),
  );
});

test("repo paths", () => {
  assert.equal(p.reposDir, path.join(root, "repos"));
  assert.equal(p.repoFile("cozrum-server"), path.join(root, "repos", "cozrum-server", "_repo.md"));
});

test("global paths", () => {
  assert.equal(p.globalDir, path.join(root, "global"));
  assert.equal(p.playbooksDir, path.join(root, "global", "playbooks"));
  assert.equal(p.instinctsDir, path.join(root, "global", "instincts"));
});
