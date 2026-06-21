import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { registerTools } from "../src/tools/index.js";
import type { Config } from "../src/config.js";

const cfg: Config = {
  vaultPath: "",
  logLevel: "error",
  tz: "Asia/Ho_Chi_Minh",
  http: { host: "127.0.0.1", port: 2091 },
  breakdown: { small: 800, large: 2000 },
  learnThreshold: 2,
};

function toolMap() {
  return new Map(registerTools({ config: cfg }).map((t) => [t.name, t]));
}

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-pbtool-"));
  await initVault(dir);
}

test("playbook_save, playbook_get, memory_promote are registered", () => {
  const tools = toolMap();
  assert.ok(tools.get("playbook_save"));
  assert.ok(tools.get("playbook_get"));
  assert.ok(tools.get("memory_promote"));
});

test("playbook_save writes and playbook_get reads it", async () => {
  await freshVault();
  const tools = toolMap();
  const saved = (await tools.get("playbook_save")!.handler({
    repo: "cozrum-server",
    slug: "run-script",
    title: "Run script safely",
    steps: "1. check-db-port\n2. run",
  })) as any;
  assert.equal(saved.status, "success");
  const got = (await tools.get("playbook_get")!.handler({ repo: "cozrum-server", slug: "run-script" })) as any;
  assert.equal(got.status, "success");
  assert.match(got.data.content, /check-db-port/);
});

test("memory_promote turns a lesson into a global instinct; warning when missing", async () => {
  await freshVault();
  const tools = toolMap();
  await tools.get("lesson_save")!.handler({ repo: "r", slug: "x", symptom: "s", cause: "c", fix: "f" });
  const ok = (await tools.get("memory_promote")!.handler({ repo: "r", lesson_slug: "x" })) as any;
  assert.equal(ok.status, "success");
  assert.equal(ok.data.instinct.id, "r-x");
  const miss = (await tools.get("memory_promote")!.handler({ repo: "r", lesson_slug: "ghost" })) as any;
  assert.equal(miss.status, "warning");
});

test("playbook_save rejects missing fields", async () => {
  await freshVault();
  const res = (await toolMap().get("playbook_save")!.handler({ repo: "r", slug: "x" })) as any;
  assert.equal(res.status, "error");
});
