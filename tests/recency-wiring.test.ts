import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { registerTools } from "../src/tools/index.js";
import { registerRepoEntry, lookupRepoBySlug } from "../src/vault/workspace-registry.js";
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-wiring-"));
  await initVault(dir);
}

test("context_set records active_feature on the feature's repos", async () => {
  await freshVault();
  await registerRepoEntry("cozrum-server", "D:/working/cozrum-server");
  const tools = toolMap();
  await tools.get("context_set")!.handler({ feature: "misa-payout", repos: ["cozrum-server"] });
  assert.equal((await lookupRepoBySlug("cozrum-server"))?.active_feature, "misa-payout");
});

test("progress_update records active_feature on the feature's repos", async () => {
  await freshVault();
  await registerRepoEntry("r1", "D:/working/r1");
  const tools = toolMap();
  await tools.get("context_set")!.handler({ feature: "feat-x", repos: ["r1"] });
  // simulate the repo's active_feature being stale, then progress_update re-asserts it
  await tools.get("progress_update")!.handler({ feature: "feat-x", last_action: "a", next_step: "n" });
  assert.equal((await lookupRepoBySlug("r1"))?.active_feature, "feat-x");
});
