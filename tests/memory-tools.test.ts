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
};

function toolMap() {
  return new Map(registerTools({ config: cfg }).map((t) => [t.name, t]));
}

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-memtools-"));
  await initVault(dir);
}

test("the new memory tools are registered with required fields", () => {
  const tools = toolMap();
  for (const name of ["context_set", "progress_update", "memory_recall"]) {
    const t = tools.get(name);
    assert.ok(t, `missing tool ${name}`);
    assert.equal(typeof t!.description, "string");
    assert.equal(t!.inputSchema.type, "object");
    assert.equal(typeof t!.handler, "function");
  }
});

test("context_set creates a feature; progress_update + memory_recall round-trip", async () => {
  await freshVault();
  const tools = toolMap();

  const setRes = (await tools.get("context_set")!.handler({
    feature: "misa-payout",
    title: "MISA Payout",
    repos: ["cozrum-server"],
  })) as any;
  assert.equal(setRes.status, "success");
  assert.equal(setRes.data.feature.slug, "misa-payout");

  const upRes = (await tools.get("progress_update")!.handler({
    feature: "misa-payout",
    last_action: "added blockIds",
    next_step: "trace cash",
  })) as any;
  assert.equal(upRes.status, "success");

  const recallRes = (await tools.get("memory_recall")!.handler({ feature: "misa-payout" })) as any;
  assert.equal(recallRes.status, "success");
  assert.equal(recallRes.data.progress.last_action, "added blockIds");
});

test("progress_update rejects a missing required field", async () => {
  await freshVault();
  const tools = toolMap();
  const res = (await tools.get("progress_update")!.handler({ feature: "f1", last_action: "x" })) as any;
  assert.equal(res.status, "error");
});
