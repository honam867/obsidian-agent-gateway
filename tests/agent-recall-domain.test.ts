import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { resolveFeature } from "../src/domain/feature.js";
import { writeProgress } from "../src/domain/working.js";
import { recordFeatureActivity } from "../src/domain/recency.js";
import { agentRecall, resolveCwd } from "../src/domain/agent-recall.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-agentrecall-"));
  await initVault(dir);
}

async function gitRepoDir(name: string) {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "oag-ws-"));
  const repo = path.join(ws, name);
  await fs.mkdir(path.join(repo, ".git"), { recursive: true });
  return repo;
}

test("resolveCwd registers a git root and returns it", async () => {
  await freshVault();
  const repoPath = await gitRepoDir("cozrum-server");
  const repo = await resolveCwd(repoPath);
  assert.equal(repo?.slug, "cozrum-server");
});

test("agentRecall uses the repo's active_feature when present", async () => {
  await freshVault();
  const repoPath = await gitRepoDir("cozrum-server");
  await resolveCwd(repoPath); // registers cozrum-server
  await resolveFeature({ slug: "misa-payout", title: "MISA Payout", repos: ["cozrum-server"] });
  await writeProgress({ feature: "misa-payout", lastAction: "did X", nextStep: "do Y" });
  await recordFeatureActivity("misa-payout"); // sets active_feature on cozrum-server

  const res = await agentRecall(repoPath);
  assert.equal(res.resolved.repo, "cozrum-server");
  assert.equal(res.resolved.feature, "misa-payout");
  assert.equal(res.resolved.how, "repo-active");
  assert.equal(res.recall.progress?.last_action, "did X");
});

test("agentRecall falls back to the globally most-recent feature for a non-repo cwd", async () => {
  await freshVault();
  await resolveFeature({ slug: "feat-a", title: "A", repos: [] });
  await writeProgress({ feature: "feat-a", lastAction: "a", nextStep: "n" });
  await recordFeatureActivity("feat-a");

  const nonRepo = await fs.mkdtemp(path.join(os.tmpdir(), "oag-plain-"));
  const res = await agentRecall(nonRepo);
  assert.equal(res.resolved.repo, null);
  assert.equal(res.resolved.feature, "feat-a");
  assert.equal(res.resolved.how, "global-recent");
});

test("agentRecall returns how=none when there are no features", async () => {
  await freshVault();
  const nonRepo = await fs.mkdtemp(path.join(os.tmpdir(), "oag-empty-"));
  const res = await agentRecall(nonRepo);
  assert.equal(res.resolved.feature, null);
  assert.equal(res.resolved.how, "none");
  assert.equal(res.recall.feature, null);
});
