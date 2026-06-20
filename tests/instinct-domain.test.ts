import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { saveInstinct, listTopInstincts } from "../src/domain/instinct.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-instinct-"));
  await initVault(dir);
}

test("first save creates with confidence 0.5 and 1 observation", async () => {
  await freshVault();
  const fm = await saveInstinct({
    slug: "forward-slash-paths",
    title: "Use forward-slash node paths on Windows",
    trigger: "Running node on Windows",
    action: "Use D:/working/... not backslashes",
    why: "Bash eats backslashes",
  });
  assert.equal(fm.id, "forward-slash-paths");
  assert.equal(fm.confidence, 0.5);
  assert.equal(fm.observations, 1);
  assert.equal(fm.status, "active");
});

test("re-saving the same slug reinforces (confidence up, observations up, created_at kept)", async () => {
  await freshVault();
  const first = await saveInstinct({ slug: "s1", title: "t", trigger: "x", action: "y", why: "z" });
  const second = await saveInstinct({ slug: "s1", title: "t", trigger: "x", action: "y", why: "z" });
  assert.equal(second.observations, 2);
  assert.ok(second.confidence > first.confidence);
  assert.equal(second.confidence, 0.75); // 0.5 + (1-0.5)*0.5
  assert.equal(second.created_at, first.created_at);
});

test("listTopInstincts sorts by confidence desc and respects limit", async () => {
  await freshVault();
  await saveInstinct({ slug: "low", title: "t", trigger: "x", action: "y", why: "z" }); // 0.5
  await saveInstinct({ slug: "high", title: "t", trigger: "x", action: "y", why: "z" });
  await saveInstinct({ slug: "high", title: "t", trigger: "x", action: "y", why: "z" }); // 0.75
  const top = await listTopInstincts(1);
  assert.equal(top.length, 1);
  assert.equal(top[0].id, "high");
});
