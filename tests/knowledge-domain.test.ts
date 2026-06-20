import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { saveKnowledge, getKnowledge, listKnowledge } from "../src/domain/knowledge.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-knowledge-"));
  await initVault(dir);
}

test("saveKnowledge writes and getKnowledge reads it back", async () => {
  await freshVault();
  const fm = await saveKnowledge({
    repo: "cozrum-server",
    area: "MISA Prepare",
    body: "Prepare links payout to transaction via payAccountId.",
    sourcePaths: ["src/controllers/finance/misa_payout/index.js"],
    tags: ["misa", "payout"],
  });
  assert.equal(fm.id, "misa-prepare");
  assert.equal(fm.repo, "cozrum-server");
  assert.equal(fm.stale, false);
  assert.deepEqual(fm.source_paths, ["src/controllers/finance/misa_payout/index.js"]);

  const got = await getKnowledge("cozrum-server", "MISA Prepare");
  assert.match(got?.content ?? "", /payAccountId/);
});

test("saveKnowledge upserts the same area (no duplicate file)", async () => {
  await freshVault();
  await saveKnowledge({ repo: "r1", area: "arch", body: "v1" });
  await saveKnowledge({ repo: "r1", area: "arch", body: "v2" });
  const pointers = await listKnowledge("r1");
  assert.equal(pointers.length, 1);
  const got = await getKnowledge("r1", "arch");
  assert.match(got?.content ?? "", /v2/);
});

test("listKnowledge returns pointers without body", async () => {
  await freshVault();
  await saveKnowledge({ repo: "r2", area: "a", body: "x", sourcePaths: ["p"] });
  await saveKnowledge({ repo: "r2", area: "b", body: "y" });
  const pointers = await listKnowledge("r2");
  assert.deepEqual(pointers.map((p) => p.id).sort(), ["a", "b"]);
  assert.deepEqual(pointers.find((p) => p.id === "a")?.source_paths, ["p"]);
});

test("listKnowledge returns [] for an unknown repo", async () => {
  await freshVault();
  assert.deepEqual(await listKnowledge("nope"), []);
});
