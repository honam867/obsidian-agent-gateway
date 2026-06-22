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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-reviewtool-"));
  await initVault(dir);
}

test("review tools are registered", () => {
  const tools = toolMap();
  for (const n of ["review_open", "review_note", "review_get", "review_approve"]) {
    assert.ok(tools.get(n), `missing ${n}`);
  }
});

test("open -> note -> get -> approve round-trip (slug auto-resolved)", async () => {
  await freshVault();
  const tools = toolMap();

  const opened = (await tools.get("review_open")!.handler({
    feature: "misa-payout",
    kind: "spec",
    path: "D:/x/oauth.md",
  })) as any;
  assert.equal(opened.status, "success");
  assert.equal(opened.data.review.state, "reviewing");

  const noted = (await tools.get("review_note")!.handler({
    feature: "misa-payout",
    kind: "spec",
    feedback: "Thiếu rate-limit.",
  })) as any;
  assert.equal(noted.status, "success");

  const got = (await tools.get("review_get")!.handler({ feature: "misa-payout", kind: "spec" })) as any;
  assert.match(got.data.content, /rate-limit/);

  const approved = (await tools.get("review_approve")!.handler({ feature: "misa-payout", kind: "spec" })) as any;
  assert.equal(approved.data.review.state, "approved");
});

test("review_note on a missing record returns warning", async () => {
  await freshVault();
  const res = (await toolMap().get("review_note")!.handler({
    feature: "nope",
    kind: "spec",
    feedback: "x",
  })) as any;
  assert.equal(res.status, "warning");
});

test("review_open rejects a missing field", async () => {
  await freshVault();
  const res = (await toolMap().get("review_open")!.handler({ feature: "f", kind: "spec" })) as any;
  assert.equal(res.status, "error");
});
