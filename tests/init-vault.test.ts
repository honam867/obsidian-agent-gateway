import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault, getPaths } from "../src/vault/vault-io.js";

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

test("initVault creates the memory-layer folders and workspace index", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-init-"));
  await initVault(dir);
  const p = getPaths();

  assert.ok(await dirExists(p.featuresDir));
  assert.ok(await dirExists(p.reposDir));
  assert.ok(await dirExists(p.playbooksDir));
  assert.ok(await dirExists(p.instinctsDir));

  const raw = await fs.readFile(p.workspaceIndexFile, "utf8");
  assert.deepEqual(JSON.parse(raw), { repos: {}, features: {} });
});
