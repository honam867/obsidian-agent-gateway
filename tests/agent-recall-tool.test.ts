import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { registerTools } from "../src/tools/index.js";
import { resolveFeature } from "../src/domain/feature.js";
import { writeProgress } from "../src/domain/working.js";
import { recordFeatureActivity } from "../src/domain/recency.js";
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-artool-"));
  await initVault(dir);
}

test("agent_recall is registered with required fields", () => {
  const t = toolMap().get("agent_recall");
  assert.ok(t);
  assert.equal(typeof t!.description, "string");
  assert.equal(t!.inputSchema.type, "object");
  assert.equal(typeof t!.handler, "function");
});

test("agent_recall returns success + the recall bundle for the most-recent feature", async () => {
  await freshVault();
  await resolveFeature({ slug: "feat-a", title: "A", repos: [] });
  await writeProgress({ feature: "feat-a", lastAction: "did X", nextStep: "do Y" });
  await recordFeatureActivity("feat-a");

  const nonRepo = await fs.mkdtemp(path.join(os.tmpdir(), "oag-arplain-"));
  const res = (await toolMap().get("agent_recall")!.handler({ cwd: nonRepo })) as any;
  assert.equal(res.status, "success");
  assert.equal(res.data.resolved.feature, "feat-a");
  assert.equal(res.data.recall.progress.last_action, "did X");
});

test("agent_recall returns warning when there is nothing to resume", async () => {
  await freshVault();
  const nonRepo = await fs.mkdtemp(path.join(os.tmpdir(), "oag-arempty-"));
  const res = (await toolMap().get("agent_recall")!.handler({ cwd: nonRepo })) as any;
  assert.equal(res.status, "warning");
  assert.equal(res.data.resolved.how, "none");
});

test("agent_recall rejects a missing cwd", async () => {
  await freshVault();
  const res = (await toolMap().get("agent_recall")!.handler({})) as any;
  assert.equal(res.status, "error");
});
