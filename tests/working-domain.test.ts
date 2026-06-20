import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { writeProgress, readProgress } from "../src/domain/working.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-working-"));
  await initVault(dir);
}

test("readProgress returns null when nothing written", async () => {
  await freshVault();
  assert.equal(await readProgress("misa-payout"), null);
});

test("writeProgress then readProgress round-trips the fields", async () => {
  await freshVault();
  const written = await writeProgress({
    feature: "misa-payout",
    lastAction: "Added blockIds to prepare payload",
    nextStep: "Trace resolveTargetForPayout for cash",
    activeTask: "003-cash-prepare",
    session: "claude-xy",
  });
  assert.equal(written.feature, "misa-payout");
  assert.equal(written.last_action, "Added blockIds to prepare payload");
  assert.equal(written.active_task, "003-cash-prepare");

  const read = await readProgress("misa-payout");
  assert.equal(read?.last_action, "Added blockIds to prepare payload");
  assert.equal(read?.next_step, "Trace resolveTargetForPayout for cash");
  assert.equal(read?.session, "claude-xy");
});

test("writeProgress overwrites and defaults optional fields to null", async () => {
  await freshVault();
  await writeProgress({ feature: "f1", lastAction: "a1", nextStep: "n1" });
  const second = await writeProgress({ feature: "f1", lastAction: "a2", nextStep: "n2" });
  assert.equal(second.active_task, null);
  assert.equal(second.session, null);
  const read = await readProgress("f1");
  assert.equal(read?.last_action, "a2");
});

test("writeProgress slugifies the feature so a slug read round-trips", async () => {
  await freshVault();
  await writeProgress({ feature: "MISA Payout", lastAction: "a", nextStep: "n" });
  const read = await readProgress("misa-payout");
  assert.equal(read?.last_action, "a");
  assert.equal(read?.feature, "misa-payout");
});
