import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { registerRepoEntry, lookupRepoBySlug } from "../src/vault/workspace-registry.js";
import { resolveFeature } from "../src/domain/feature.js";
import { recordFeatureActivity } from "../src/domain/recency.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-recencydom-"));
  await initVault(dir);
}

test("recordFeatureActivity sets active_feature on all the feature's repos", async () => {
  await freshVault();
  await registerRepoEntry("cozrum-server", "D:/working/cozrum-server");
  await registerRepoEntry("cozrum-cms", "D:/working/cozrum-cms");
  await resolveFeature({ slug: "misa-payout", title: "MISA Payout", repos: ["cozrum-server", "cozrum-cms"] });

  await recordFeatureActivity("misa-payout");

  assert.equal((await lookupRepoBySlug("cozrum-server"))?.active_feature, "misa-payout");
  assert.equal((await lookupRepoBySlug("cozrum-cms"))?.active_feature, "misa-payout");
});

test("recordFeatureActivity slugifies a non-slug label", async () => {
  await freshVault();
  await registerRepoEntry("r1", "D:/working/r1");
  await resolveFeature({ slug: "misa-payout", title: "MISA Payout", repos: ["r1"] });
  await recordFeatureActivity("MISA Payout");
  assert.equal((await lookupRepoBySlug("r1"))?.active_feature, "misa-payout");
});

test("recordFeatureActivity is safe when the feature does not exist", async () => {
  await freshVault();
  await recordFeatureActivity("ghost"); // must not throw
  assert.ok(true);
});
