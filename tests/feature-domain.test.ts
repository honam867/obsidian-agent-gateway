import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault, readMarkdown } from "../src/vault/vault-io.js";
import { getPaths } from "../src/vault/vault-io.js";
import { discoverRepos, registerRepo, resolveFeature, getFeature } from "../src/domain/feature.js";
import type { RepoFrontmatter } from "../src/schemas/repo.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-feat-"));
  await initVault(dir);
}

async function fakeWorkspace() {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "oag-ws-root-"));
  for (const name of ["cozrum-server", "cozrum-cms"]) {
    await fs.mkdir(path.join(ws, name, ".git"), { recursive: true });
  }
  await fs.mkdir(path.join(ws, "not-a-repo"), { recursive: true });
  return ws;
}

test("discoverRepos finds only git roots", async () => {
  await freshVault();
  const ws = await fakeWorkspace();
  const repos = await discoverRepos(ws);
  assert.deepEqual(
    repos.map((r) => r.slug),
    ["cozrum-cms", "cozrum-server"],
  );
});

test("registerRepo is idempotent by path and writes _repo.md", async () => {
  await freshVault();
  const ws = await fakeWorkspace();
  const repoPath = path.join(ws, "cozrum-server");

  const first = await registerRepo(repoPath);
  assert.equal(first.slug, "cozrum-server");
  assert.equal(first.created, true);

  const again = await registerRepo(repoPath);
  assert.equal(again.created, false);

  const doc = await readMarkdown<RepoFrontmatter>(getPaths().repoFile("cozrum-server"));
  assert.equal(doc?.data.slug, "cozrum-server");
});

test("resolveFeature creates then merges repos/paths", async () => {
  await freshVault();
  const created = await resolveFeature({ title: "MISA Payout", repos: ["cozrum-server"] });
  assert.equal(created.slug, "misa-payout");
  assert.equal(created.created, true);
  assert.deepEqual(created.repos, ["cozrum-server"]);

  const merged = await resolveFeature({ slug: "misa-payout", repos: ["cozrum-cms"], paths: ["x/y"] });
  assert.equal(merged.created, false);
  assert.deepEqual(merged.repos, ["cozrum-server", "cozrum-cms"]);
  assert.deepEqual(merged.paths, ["x/y"]);

  const got = await getFeature("misa-payout");
  assert.equal(got?.title, "MISA Payout");
});
