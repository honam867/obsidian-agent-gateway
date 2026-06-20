import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import {
  registerRepoEntry,
  lookupRepoBySlug,
  upsertFeatureEntry,
  setRepoActiveFeature,
  touchFeatureUpdatedAt,
  getMostRecentFeature,
} from "../src/vault/workspace-registry.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-recency-"));
  await initVault(dir);
}

function feature(slug: string, updatedAt: string) {
  return { slug, title: slug, repos: [], paths: [], status: "active", created_at: updatedAt, updated_at: updatedAt };
}

test("setRepoActiveFeature stores active_feature on the repo", async () => {
  await freshVault();
  await registerRepoEntry("cozrum-server", "D:/working/cozrum-server");
  await setRepoActiveFeature("cozrum-server", "misa-payout");
  const repo = await lookupRepoBySlug("cozrum-server");
  assert.equal(repo?.active_feature, "misa-payout");
});

test("setRepoActiveFeature is a no-op for an unknown repo", async () => {
  await freshVault();
  await setRepoActiveFeature("nope", "x");
  assert.equal(await lookupRepoBySlug("nope"), null);
});

test("getMostRecentFeature returns the feature with the latest updated_at", async () => {
  await freshVault();
  await upsertFeatureEntry(feature("old", "2026-06-01T00:00:00.000Z"));
  await upsertFeatureEntry(feature("new", "2026-06-20T00:00:00.000Z"));
  const recent = await getMostRecentFeature();
  assert.equal(recent?.slug, "new");
});

test("touchFeatureUpdatedAt bumps updated_at and changes the most-recent winner", async () => {
  await freshVault();
  await upsertFeatureEntry(feature("a", "2026-06-01T00:00:00.000Z"));
  await upsertFeatureEntry(feature("b", "2026-06-02T00:00:00.000Z"));
  await touchFeatureUpdatedAt("a"); // a now newest
  const recent = await getMostRecentFeature();
  assert.equal(recent?.slug, "a");
});

test("getMostRecentFeature returns null when there are no features", async () => {
  await freshVault();
  assert.equal(await getMostRecentFeature(), null);
});
