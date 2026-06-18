import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { makeVaultPaths } from "../src/vault/paths.js";

const p = makeVaultPaths("/vault");

test("workspaceIndexFile lives under _index", () => {
  assert.equal(p.workspaceIndexFile, path.join("/vault", "_index", "workspace.json"));
});

test("feature paths", () => {
  assert.equal(p.featuresDir, path.join("/vault", "features"));
  assert.equal(p.featureDir("misa-payout"), path.join("/vault", "features", "misa-payout"));
  assert.equal(
    p.featureFile("misa-payout"),
    path.join("/vault", "features", "misa-payout", "_feature.md"),
  );
});

test("repo paths", () => {
  assert.equal(p.reposDir, path.join("/vault", "repos"));
  assert.equal(p.repoFile("cozrum-server"), path.join("/vault", "repos", "cozrum-server", "_repo.md"));
});

test("global paths", () => {
  assert.equal(p.globalDir, path.join("/vault", "global"));
  assert.equal(p.playbooksDir, path.join("/vault", "global", "playbooks"));
  assert.equal(p.instinctsDir, path.join("/vault", "global", "instincts"));
});
