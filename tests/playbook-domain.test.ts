import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { savePlaybook, getPlaybook, listPlaybooks } from "../src/domain/playbook.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-playbook-"));
  await initVault(dir);
}

test("savePlaybook stores title+steps; getPlaybook reads them; first save confidence 0.5", async () => {
  await freshVault();
  const fm = await savePlaybook({
    repo: "cozrum-server",
    slug: "run-script-safely",
    title: "Run a cozrum-server script safely",
    steps: "1. check-db-port.js\n2. run the script with forward slashes",
  });
  assert.equal(fm.id, "run-script-safely");
  assert.equal(fm.confidence, 0.5);
  assert.equal(fm.observations, 1);
  const got = await getPlaybook("cozrum-server", "run-script-safely");
  assert.match(got?.content ?? "", /check-db-port/);
});

test("re-saving reinforces (0.5 -> 0.75, obs 2, created_at kept)", async () => {
  await freshVault();
  const first = await savePlaybook({ repo: "r1", slug: "p", title: "P", steps: "a" });
  const second = await savePlaybook({ repo: "r1", slug: "p", title: "P", steps: "b" });
  assert.equal(second.observations, 2);
  assert.equal(second.confidence, 0.75);
  assert.equal(second.created_at, first.created_at);
});

test("listPlaybooks sorts by confidence; [] for unknown repo", async () => {
  await freshVault();
  await savePlaybook({ repo: "r2", slug: "low", title: "L", steps: "x" });
  await savePlaybook({ repo: "r2", slug: "high", title: "H", steps: "x" });
  await savePlaybook({ repo: "r2", slug: "high", title: "H", steps: "x" });
  const pointers = await listPlaybooks("r2");
  assert.equal(pointers[0].id, "high");
  assert.deepEqual(await listPlaybooks("nope"), []);
});
