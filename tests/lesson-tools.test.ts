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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-lessontool-"));
  await initVault(dir);
}

test("lesson_save + lesson_get are registered", () => {
  const tools = toolMap();
  assert.ok(tools.get("lesson_save"));
  assert.ok(tools.get("lesson_get"));
});

test("lesson_save writes; second save crosses threshold and emits a nudge", async () => {
  await freshVault();
  const tools = toolMap();
  const first = (await tools.get("lesson_save")!.handler({
    repo: "cozrum-server",
    slug: "cash",
    symptom: "s",
    cause: "c",
    fix: "f",
  })) as any;
  assert.equal(first.status, "success");
  assert.equal(first.data.lesson.observations, 1);
  assert.ok(!first.next_actions.join(" ").match(/recurred/i));

  const second = (await tools.get("lesson_save")!.handler({
    repo: "cozrum-server",
    slug: "cash",
    symptom: "s",
    cause: "c",
    fix: "f",
  })) as any;
  assert.equal(second.data.lesson.observations, 2);
  assert.ok(second.next_actions.join(" ").match(/recurred/i));
});

test("lesson_get returns the body; warning when missing", async () => {
  await freshVault();
  const tools = toolMap();
  await tools.get("lesson_save")!.handler({ repo: "r", slug: "x", symptom: "s", cause: "c", fix: "f" });
  const got = (await tools.get("lesson_get")!.handler({ repo: "r", slug: "x" })) as any;
  assert.equal(got.status, "success");
  assert.match(got.data.content, /Symptom/);
  const miss = (await tools.get("lesson_get")!.handler({ repo: "r", slug: "ghost" })) as any;
  assert.equal(miss.status, "warning");
});

test("lesson_save rejects a missing required field", async () => {
  await freshVault();
  const res = (await toolMap().get("lesson_save")!.handler({ repo: "r", slug: "x" })) as any;
  assert.equal(res.status, "error");
});
