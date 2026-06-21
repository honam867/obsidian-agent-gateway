import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { resolveFeature } from "../src/domain/feature.js";
import { saveLesson } from "../src/domain/lesson.js";
import { savePlaybook } from "../src/domain/playbook.js";
import { recall } from "../src/domain/recall.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-recall-sl-"));
  await initVault(dir);
}

test("recall includes the feature's repo lessons and playbooks", async () => {
  await freshVault();
  await resolveFeature({ slug: "misa-payout", title: "MISA Payout", repos: ["cozrum-server"] });
  await saveLesson({ repo: "cozrum-server", slug: "cash", symptom: "s", cause: "c", fix: "f" });
  await savePlaybook({ repo: "cozrum-server", slug: "run", title: "Run", steps: "x" });

  const bundle = await recall("misa-payout");
  assert.deepEqual(bundle.lessons.map((l) => l.id), ["cash"]);
  assert.deepEqual(bundle.playbooks.map((p) => p.id), ["run"]);
});

test("recall on unknown feature returns empty lessons/playbooks", async () => {
  await freshVault();
  const bundle = await recall("nope");
  assert.deepEqual(bundle.lessons, []);
  assert.deepEqual(bundle.playbooks, []);
});
