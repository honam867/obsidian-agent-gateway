import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { saveLesson, getLesson, listLessons } from "../src/domain/lesson.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-lesson-"));
  await initVault(dir);
}

test("saveLesson stores symptom/cause/fix and getLesson reads them back", async () => {
  await freshVault();
  const fm = await saveLesson({
    repo: "cozrum-server",
    slug: "cash-remap-null",
    symptom: "remap returns null account for cash",
    cause: "PAYOUT_CASH_SOURCES not matched",
    fix: "use resolveTargetForPayout cash branch",
    sourcePaths: ["src/.../index.js"],
  });
  assert.equal(fm.id, "cash-remap-null");
  assert.equal(fm.status, "fixed");
  assert.equal(fm.confidence, 0.5);
  assert.equal(fm.observations, 1);
  assert.equal(fm.cause, "PAYOUT_CASH_SOURCES not matched");

  const got = await getLesson("cozrum-server", "cash-remap-null");
  assert.match(got?.content ?? "", /resolveTargetForPayout/);
});

test("re-saving the same lesson reinforces (0.5 -> 0.75, obs 1 -> 2, created_at kept)", async () => {
  await freshVault();
  const first = await saveLesson({ repo: "r1", slug: "x", symptom: "s", cause: "c", fix: "f" });
  const second = await saveLesson({ repo: "r1", slug: "x", symptom: "s", cause: "c", fix: "f2" });
  assert.equal(second.observations, 2);
  assert.equal(second.confidence, 0.75);
  assert.equal(second.created_at, first.created_at);
  assert.equal(second.fix, "f2");
});

test("listLessons returns pointers sorted by confidence; [] for unknown repo", async () => {
  await freshVault();
  await saveLesson({ repo: "r2", slug: "low", symptom: "s", cause: "c", fix: "f" }); // 0.5
  await saveLesson({ repo: "r2", slug: "high", symptom: "s", cause: "c", fix: "f" });
  await saveLesson({ repo: "r2", slug: "high", symptom: "s", cause: "c", fix: "f" }); // 0.75
  const pointers = await listLessons("r2");
  assert.equal(pointers[0].id, "high");
  assert.deepEqual(await listLessons("nope"), []);
});
