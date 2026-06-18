import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import {
  registerRepoEntry,
  lookupRepoBySlug,
  lookupRepoByPath,
  listRepoEntries,
  upsertFeatureEntry,
  lookupFeatureBySlug,
  listFeatureEntries,
} from "../src/vault/workspace-registry.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-ws-"));
  await initVault(dir);
  return dir;
}

test("registers and looks up a repo by slug and path", async () => {
  await freshVault();
  const entry = await registerRepoEntry("cozrum-server", "D:/working/cozrum-server", "git@x:cozrum-server.git");
  assert.equal(entry.slug, "cozrum-server");
  assert.equal(entry.git_remote, "git@x:cozrum-server.git");
  assert.ok(entry.registered_at);

  const bySlug = await lookupRepoBySlug("cozrum-server");
  assert.equal(bySlug?.path, path.resolve("D:/working/cozrum-server"));
  const byPath = await lookupRepoByPath("D:/working/cozrum-server");
  assert.equal(byPath?.slug, "cozrum-server");
});

test("upserts and lists features", async () => {
  await freshVault();
  await upsertFeatureEntry({
    slug: "misa-payout",
    title: "MISA Payout",
    repos: ["cozrum-server"],
    paths: ["cozrum-server/src/misa"],
    status: "active",
    created_at: "2026-06-19T00:00:00.000Z",
    updated_at: "2026-06-19T00:00:00.000Z",
  });
  const found = await lookupFeatureBySlug("misa-payout");
  assert.equal(found?.title, "MISA Payout");
  assert.deepEqual(found?.repos, ["cozrum-server"]);

  const all = await listFeatureEntries();
  assert.equal(all.length, 1);
});

test("registry survives reload from disk", async () => {
  const dir = await freshVault();
  await registerRepoEntry("a-repo", path.join(dir, "a"));
  await initVault(dir); // simulate a fresh process pointing at the same vault
  const entries = await listRepoEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].slug, "a-repo");
});
