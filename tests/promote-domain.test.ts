import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { saveLesson } from "../src/domain/lesson.js";
import { listTopInstincts } from "../src/domain/instinct.js";
import { promoteLessonToInstinct } from "../src/domain/promote.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-promote-"));
  await initVault(dir);
}

test("promote turns a repo lesson into a global instinct", async () => {
  await freshVault();
  await saveLesson({ repo: "cozrum-server", slug: "cash", symptom: "S", cause: "C", fix: "F" });
  const instinct = await promoteLessonToInstinct("cozrum-server", "cash");
  assert.equal(instinct?.id, "cozrum-server-cash");
  const top = await listTopInstincts(5);
  assert.ok(top.some((i) => i.id === "cozrum-server-cash"));
});

test("promote returns null for a missing lesson", async () => {
  await freshVault();
  assert.equal(await promoteLessonToInstinct("r", "ghost"), null);
});
