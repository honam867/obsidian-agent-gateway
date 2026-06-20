import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { resolveFeature } from "../src/domain/feature.js";
import { writeProgress } from "../src/domain/working.js";
import { saveKnowledge } from "../src/domain/knowledge.js";
import { saveInstinct } from "../src/domain/instinct.js";
import { recall } from "../src/domain/recall.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-recall-"));
  await initVault(dir);
}

test("recall assembles feature + progress + knowledge + instincts", async () => {
  await freshVault();
  await resolveFeature({ slug: "misa-payout", title: "MISA Payout", repos: ["cozrum-server", "cozrum-cms"] });
  await writeProgress({ feature: "misa-payout", lastAction: "did X", nextStep: "do Y" });
  await saveKnowledge({ repo: "cozrum-server", area: "prepare", body: "...", sourcePaths: ["a.js"] });
  await saveInstinct({ slug: "i1", title: "t", trigger: "x", action: "y", why: "z" });

  const bundle = await recall("misa-payout");
  assert.equal(bundle.feature?.slug, "misa-payout");
  assert.equal(bundle.progress?.last_action, "did X");
  assert.deepEqual(bundle.knowledge.map((k) => k.id), ["prepare"]);
  assert.equal(bundle.instincts.length, 1);
});

test("recall on unknown feature returns null feature but still global instincts", async () => {
  await freshVault();
  await saveInstinct({ slug: "g1", title: "t", trigger: "x", action: "y", why: "z" });
  const bundle = await recall("nope");
  assert.equal(bundle.feature, null);
  assert.equal(bundle.progress, null);
  assert.deepEqual(bundle.knowledge, []);
  assert.equal(bundle.instincts.length, 1);
});
