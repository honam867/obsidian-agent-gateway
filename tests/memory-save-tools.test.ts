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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-savetools-"));
  await initVault(dir);
}

test("knowledge_save and instinct_save are registered", () => {
  const tools = toolMap();
  assert.ok(tools.get("knowledge_save"));
  assert.ok(tools.get("instinct_save"));
});

test("knowledge_save writes a knowledge entry", async () => {
  await freshVault();
  const tools = toolMap();
  const res = (await tools.get("knowledge_save")!.handler({
    repo: "cozrum-server",
    area: "prepare",
    body: "links payout to transaction",
    source_paths: ["index.js"],
  })) as any;
  assert.equal(res.status, "success");
  assert.equal(res.data.knowledge.id, "prepare");
});

test("instinct_save creates then reinforces", async () => {
  await freshVault();
  const tools = toolMap();
  const first = (await tools.get("instinct_save")!.handler({
    slug: "fs-paths",
    title: "forward slash",
    trigger: "windows node",
    action: "use /",
    why: "bash eats backslash",
  })) as any;
  assert.equal(first.data.instinct.observations, 1);
  const second = (await tools.get("instinct_save")!.handler({
    slug: "fs-paths",
    title: "forward slash",
    trigger: "windows node",
    action: "use /",
    why: "bash eats backslash",
  })) as any;
  assert.equal(second.data.instinct.observations, 2);
});

test("instinct_save rejects missing required field", async () => {
  await freshVault();
  const tools = toolMap();
  const res = (await tools.get("instinct_save")!.handler({ slug: "x", title: "t" })) as any;
  assert.equal(res.status, "error");
});
