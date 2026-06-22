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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-reviewlist-"));
  await initVault(dir);
}

test("review_list is registered", () => {
  assert.ok(toolMap().get("review_list"));
});

test("review_list returns reviewing records across features", async () => {
  await freshVault();
  const tools = toolMap();
  await tools.get("review_open")!.handler({ feature: "fa", kind: "spec", path: "D:/x/a.md" });
  await tools.get("review_open")!.handler({ feature: "fb", kind: "plan", path: "D:/x/b.md" });
  await tools.get("review_approve")!.handler({ feature: "fb", kind: "plan" });

  const res = (await tools.get("review_list")!.handler({ state: "reviewing" })) as any;
  assert.equal(res.status, "success");
  assert.deepEqual(res.data.reviews.map((r: any) => r.feature), ["fa"]);
});

test("review_list with no state returns all", async () => {
  await freshVault();
  const tools = toolMap();
  await tools.get("review_open")!.handler({ feature: "fa", kind: "spec", path: "D:/x/a.md" });
  const res = (await tools.get("review_list")!.handler({})) as any;
  assert.equal(res.data.reviews.length, 1);
});
