# Agent Gateway — Auto-Recall + Memory Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `agent_recall(cwd)` front-door tool that auto-resolves repo→feature and returns the recall bundle, plus the recency wiring that makes "last-active feature per repo" work, plus the `memory-protocol.md` that tells any agent when to call which memory tool.

**Architecture:** Additive on the Plan 1/B substrate. New registry primitives track `active_feature` per repo and feature recency; a `recency` domain records activity (touch `updated_at` + set repos' `active_feature`); an `agent-recall` domain resolves a repo from `cwd` and picks the right feature; a new MCP tool exposes it; the existing `context_set`/`progress_update` tools call the recency recorder. The protocol doc is the cross-CLI instruction source.

**Tech Stack:** TypeScript (strict, ESM `NodeNext`), `gray-matter`, `write-file-atomic`, `zod`, `node:test`.

## Global Constraints

- Node `>=20`; TypeScript `strict`; `module`/`moduleResolution` = `NodeNext` (import siblings with the `.js` extension).
- Tests compiled to `dist/tests/` and run with `node --test`; always `npm run build` before a test. Cycle: `npm run build && node --test dist/tests/<file>.test.js`.
- Code style uses `?.` / `??` freely. Registry writes are immutable (spread, never mutate `idx`).
- The new MCP tool returns the observation contract: `{ status: "success"|"warning"|"error", summary: string, next_actions: string[], artifacts: string[], data? }`.
- Feature/repo keys are slugs; `slugify` (`src/utils/slug.js`) normalizes (e.g. `"MISA Payout"` → `"misa-payout"`).
- Scope resolution: `active_feature` per repo; if cwd has no repo/active feature → globally most-recent feature; if no features → warning.

---

### Task 1: Registry recency primitives

**Files:**
- Modify: `src/vault/workspace-registry.ts`
- Test: `tests/registry-recency.test.ts`

**Interfaces:**
- Consumes: existing `readIndex`/`writeIndex` internals; `RepoEntry`, `FeatureEntry`.
- Produces: `RepoEntry` gains optional `active_feature?: string`; new exports
  `setRepoActiveFeature(repoSlug: string, featureSlug: string): Promise<void>` (no-op if repo absent),
  `touchFeatureUpdatedAt(featureSlug: string): Promise<void>` (no-op if feature absent),
  `getMostRecentFeature(): Promise<FeatureEntry | null>` (max `updated_at`, tie-break by slug).

- [ ] **Step 1: Write the failing test**

Create `tests/registry-recency.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import {
  registerRepoEntry,
  lookupRepoBySlug,
  upsertFeatureEntry,
  setRepoActiveFeature,
  touchFeatureUpdatedAt,
  getMostRecentFeature,
} from "../src/vault/workspace-registry.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-recency-"));
  await initVault(dir);
}

function feature(slug: string, updatedAt: string) {
  return { slug, title: slug, repos: [], paths: [], status: "active", created_at: updatedAt, updated_at: updatedAt };
}

test("setRepoActiveFeature stores active_feature on the repo", async () => {
  await freshVault();
  await registerRepoEntry("cozrum-server", "D:/working/cozrum-server");
  await setRepoActiveFeature("cozrum-server", "misa-payout");
  const repo = await lookupRepoBySlug("cozrum-server");
  assert.equal(repo?.active_feature, "misa-payout");
});

test("setRepoActiveFeature is a no-op for an unknown repo", async () => {
  await freshVault();
  await setRepoActiveFeature("nope", "x");
  assert.equal(await lookupRepoBySlug("nope"), null);
});

test("getMostRecentFeature returns the feature with the latest updated_at", async () => {
  await freshVault();
  await upsertFeatureEntry(feature("old", "2026-06-01T00:00:00.000Z"));
  await upsertFeatureEntry(feature("new", "2026-06-20T00:00:00.000Z"));
  const recent = await getMostRecentFeature();
  assert.equal(recent?.slug, "new");
});

test("touchFeatureUpdatedAt bumps updated_at and changes the most-recent winner", async () => {
  await freshVault();
  await upsertFeatureEntry(feature("a", "2026-06-01T00:00:00.000Z"));
  await upsertFeatureEntry(feature("b", "2026-06-02T00:00:00.000Z"));
  await touchFeatureUpdatedAt("a"); // a now newest
  const recent = await getMostRecentFeature();
  assert.equal(recent?.slug, "a");
});

test("getMostRecentFeature returns null when there are no features", async () => {
  await freshVault();
  assert.equal(await getMostRecentFeature(), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/registry-recency.test.js`
Expected: build error — the new exports don't exist.

- [ ] **Step 3: Add `active_feature` + the three functions**

In `src/vault/workspace-registry.ts`, add to the `RepoEntry` interface (after `registered_at: string;`):

```ts
  active_feature?: string;
```

Append these exported functions at the end of the file:

```ts
export async function setRepoActiveFeature(
  repoSlug: string,
  featureSlug: string,
): Promise<void> {
  const idx = await readIndex();
  const repo = idx.repos[repoSlug];
  if (!repo) return;
  await writeIndex({
    ...idx,
    repos: { ...idx.repos, [repoSlug]: { ...repo, active_feature: featureSlug } },
  });
}

export async function touchFeatureUpdatedAt(featureSlug: string): Promise<void> {
  const idx = await readIndex();
  const feature = idx.features[featureSlug];
  if (!feature) return;
  await writeIndex({
    ...idx,
    features: {
      ...idx.features,
      [featureSlug]: { ...feature, updated_at: new Date().toISOString() },
    },
  });
}

export async function getMostRecentFeature(): Promise<FeatureEntry | null> {
  const idx = await readIndex();
  const features = Object.values(idx.features);
  if (features.length === 0) return null;
  return features.slice().sort((a, b) => {
    const at = Date.parse(a.updated_at) || 0;
    const bt = Date.parse(b.updated_at) || 0;
    if (bt !== at) return bt - at;
    return a.slug.localeCompare(b.slug);
  })[0];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/registry-recency.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vault/workspace-registry.ts tests/registry-recency.test.ts
git commit -m "feat: registry active_feature + feature recency primitives"
```

---

### Task 2: Recency recorder domain

**Files:**
- Create: `src/domain/recency.ts`
- Test: `tests/recency-domain.test.ts`

**Interfaces:**
- Consumes: `slugify` (`utils/slug.js`); `touchFeatureUpdatedAt`, `setRepoActiveFeature` (Task 1); `getFeature` (`domain/feature.js`, returns `ResolvedFeature | null` with `.repos: string[]`).
- Produces: `recordFeatureActivity(featureSlug: string): Promise<void>` — slugifies, bumps the feature's `updated_at`, and sets `active_feature = slug` on every repo the feature spans.

- [ ] **Step 1: Write the failing test**

Create `tests/recency-domain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { registerRepoEntry, lookupRepoBySlug } from "../src/vault/workspace-registry.js";
import { resolveFeature } from "../src/domain/feature.js";
import { recordFeatureActivity } from "../src/domain/recency.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-recencydom-"));
  await initVault(dir);
}

test("recordFeatureActivity sets active_feature on all the feature's repos", async () => {
  await freshVault();
  await registerRepoEntry("cozrum-server", "D:/working/cozrum-server");
  await registerRepoEntry("cozrum-cms", "D:/working/cozrum-cms");
  await resolveFeature({ slug: "misa-payout", title: "MISA Payout", repos: ["cozrum-server", "cozrum-cms"] });

  await recordFeatureActivity("misa-payout");

  assert.equal((await lookupRepoBySlug("cozrum-server"))?.active_feature, "misa-payout");
  assert.equal((await lookupRepoBySlug("cozrum-cms"))?.active_feature, "misa-payout");
});

test("recordFeatureActivity slugifies a non-slug label", async () => {
  await freshVault();
  await registerRepoEntry("r1", "D:/working/r1");
  await resolveFeature({ slug: "misa-payout", title: "MISA Payout", repos: ["r1"] });
  await recordFeatureActivity("MISA Payout");
  assert.equal((await lookupRepoBySlug("r1"))?.active_feature, "misa-payout");
});

test("recordFeatureActivity is safe when the feature does not exist", async () => {
  await freshVault();
  await recordFeatureActivity("ghost"); // must not throw
  assert.ok(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/recency-domain.test.js`
Expected: build error — module missing.

- [ ] **Step 3: Implement the module**

`src/domain/recency.ts`:

```ts
import { slugify } from "../utils/slug.js";
import { getFeature } from "./feature.js";
import { touchFeatureUpdatedAt, setRepoActiveFeature } from "../vault/workspace-registry.js";

export async function recordFeatureActivity(featureSlug: string): Promise<void> {
  const slug = slugify(featureSlug) || "feature";
  await touchFeatureUpdatedAt(slug);
  const feature = await getFeature(slug);
  if (!feature) return;
  for (const repo of feature.repos) {
    await setRepoActiveFeature(repo, slug);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/recency-domain.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/recency.ts tests/recency-domain.test.ts
git commit -m "feat: recency recorder (touch updated_at + set repo active_feature)"
```

---

### Task 3: Agent-recall domain (cwd → repo → feature)

**Files:**
- Create: `src/domain/agent-recall.ts`
- Test: `tests/agent-recall-domain.test.ts`

**Interfaces:**
- Consumes: `node:path`; `fileExists` (`vault/atomic-write.js`); `listRepoEntries`, `lookupRepoBySlug`, `getMostRecentFeature`, `RepoEntry` (`vault/workspace-registry.js`); `registerRepo` (`domain/feature.js`, returns `{ slug, path, created }`); `recall`, `RecallBundle` (`domain/recall.js`).
- Produces:
  - `resolveCwd(cwd: string): Promise<RepoEntry | null>` — the registered repo whose path equals/contains `cwd` (most specific wins); else if `cwd` is itself a git root, register it and return it; else `null`.
  - `type RecallHow = "repo-active" | "global-recent" | "none"`.
  - `interface AgentRecallResult { resolved: { repo: string | null; feature: string | null; how: RecallHow }; recall: RecallBundle }`.
  - `agentRecall(cwd: string, opts?: { instinctLimit?: number }): Promise<AgentRecallResult>`.

- [ ] **Step 1: Write the failing test**

Create `tests/agent-recall-domain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { resolveFeature } from "../src/domain/feature.js";
import { writeProgress } from "../src/domain/working.js";
import { recordFeatureActivity } from "../src/domain/recency.js";
import { agentRecall, resolveCwd } from "../src/domain/agent-recall.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-agentrecall-"));
  await initVault(dir);
}

async function gitRepoDir(name: string) {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "oag-ws-"));
  const repo = path.join(ws, name);
  await fs.mkdir(path.join(repo, ".git"), { recursive: true });
  return repo;
}

test("resolveCwd registers a git root and returns it", async () => {
  await freshVault();
  const repoPath = await gitRepoDir("cozrum-server");
  const repo = await resolveCwd(repoPath);
  assert.equal(repo?.slug, "cozrum-server");
});

test("agentRecall uses the repo's active_feature when present", async () => {
  await freshVault();
  const repoPath = await gitRepoDir("cozrum-server");
  await resolveCwd(repoPath); // registers cozrum-server
  await resolveFeature({ slug: "misa-payout", title: "MISA Payout", repos: ["cozrum-server"] });
  await writeProgress({ feature: "misa-payout", lastAction: "did X", nextStep: "do Y" });
  await recordFeatureActivity("misa-payout"); // sets active_feature on cozrum-server

  const res = await agentRecall(repoPath);
  assert.equal(res.resolved.repo, "cozrum-server");
  assert.equal(res.resolved.feature, "misa-payout");
  assert.equal(res.resolved.how, "repo-active");
  assert.equal(res.recall.progress?.last_action, "did X");
});

test("agentRecall falls back to the globally most-recent feature for a non-repo cwd", async () => {
  await freshVault();
  await resolveFeature({ slug: "feat-a", title: "A", repos: [] });
  await writeProgress({ feature: "feat-a", lastAction: "a", nextStep: "n" });
  await recordFeatureActivity("feat-a");

  const nonRepo = await fs.mkdtemp(path.join(os.tmpdir(), "oag-plain-"));
  const res = await agentRecall(nonRepo);
  assert.equal(res.resolved.repo, null);
  assert.equal(res.resolved.feature, "feat-a");
  assert.equal(res.resolved.how, "global-recent");
});

test("agentRecall returns how=none when there are no features", async () => {
  await freshVault();
  const nonRepo = await fs.mkdtemp(path.join(os.tmpdir(), "oag-empty-"));
  const res = await agentRecall(nonRepo);
  assert.equal(res.resolved.feature, null);
  assert.equal(res.resolved.how, "none");
  assert.equal(res.recall.feature, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/agent-recall-domain.test.js`
Expected: build error — module missing.

- [ ] **Step 3: Implement the module**

`src/domain/agent-recall.ts`:

```ts
import path from "node:path";
import { fileExists } from "../vault/atomic-write.js";
import {
  listRepoEntries,
  lookupRepoBySlug,
  getMostRecentFeature,
  RepoEntry,
} from "../vault/workspace-registry.js";
import { registerRepo } from "./feature.js";
import { recall, RecallBundle } from "./recall.js";

function isInside(child: string, parent: string): boolean {
  const c = path.resolve(child).toLowerCase();
  const p = path.resolve(parent).toLowerCase();
  if (c === p) return true;
  return c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

export async function resolveCwd(cwd: string): Promise<RepoEntry | null> {
  const normalized = path.resolve(cwd);
  const repos = await listRepoEntries();
  const matches = repos
    .filter((r) => isInside(normalized, r.path))
    .sort((a, b) => b.path.length - a.path.length);
  if (matches.length > 0) return matches[0];

  if (await fileExists(path.join(normalized, ".git"))) {
    const reg = await registerRepo(normalized);
    return lookupRepoBySlug(reg.slug);
  }
  return null;
}

export type RecallHow = "repo-active" | "global-recent" | "none";

export interface AgentRecallResult {
  resolved: { repo: string | null; feature: string | null; how: RecallHow };
  recall: RecallBundle;
}

export async function agentRecall(
  cwd: string,
  opts?: { instinctLimit?: number },
): Promise<AgentRecallResult> {
  const repo = await resolveCwd(cwd);

  let featureSlug: string | null = null;
  let how: RecallHow = "none";

  if (repo?.active_feature) {
    featureSlug = repo.active_feature;
    how = "repo-active";
  } else {
    const recent = await getMostRecentFeature();
    if (recent) {
      featureSlug = recent.slug;
      how = "global-recent";
    }
  }

  const bundle = await recall(featureSlug ?? "__none__", { instinctLimit: opts?.instinctLimit });
  return {
    resolved: { repo: repo?.slug ?? null, feature: featureSlug, how },
    recall: bundle,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/agent-recall-domain.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/agent-recall.ts tests/agent-recall-domain.test.ts
git commit -m "feat: agent-recall domain (cwd -> repo -> feature resolution)"
```

---

### Task 4: `agent_recall` MCP tool

**Files:**
- Create: `src/tools/agent-recall.ts`
- Modify: `src/tools/index.ts`
- Test: `tests/agent-recall-tool.test.ts`

**Interfaces:**
- Consumes: `ToolContext`, `ToolDef` (`tools/types.js`); `agentRecall` (Task 3); `registerTools` for the test.
- Produces: `agentRecallTool(ctx): ToolDef` (name `agent_recall`), registered in `registerTools`. Returns the observation contract; `status` is `"warning"` when `resolved.how === "none"`, else `"success"`.

- [ ] **Step 1: Write the failing test**

Create `tests/agent-recall-tool.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/agent-recall-tool.test.js`
Expected: build error — module / registration missing.

- [ ] **Step 3: Create `src/tools/agent-recall.ts`**

```ts
import { z } from "zod";
import { agentRecall } from "../domain/agent-recall.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  instinct_limit: z.number().int().positive().optional(),
});

export function agentRecallTool(_ctx: ToolContext): ToolDef {
  return {
    name: "agent_recall",
    description:
      "Call this FIRST in a session (or when the user asks 'what was I doing / continue / which repo'). Pass your current working directory; the server resolves the repo + the feature you last worked on there, and returns the working context (last action, next step, knowledge, instincts) so you don't re-read the codebase. You do not need to know the feature slug.",
    annotations: { title: "Agent Recall", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Absolute path of the session's current working directory." },
        instinct_limit: { type: "integer", minimum: 1, description: "Max instincts to return (default 5)." },
      },
      required: ["cwd"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return {
          status: "error",
          summary: parsed.error.issues[0]?.message ?? "Invalid input",
          next_actions: ["Provide a non-empty 'cwd'."],
          artifacts: [],
        };
      }
      const result = await agentRecall(parsed.data.cwd, { instinctLimit: parsed.data.instinct_limit });
      const { resolved, recall } = result;
      if (resolved.how === "none") {
        return {
          status: "warning",
          summary: "No feature to resume yet for this location.",
          next_actions: ["Call context_set to start a feature, then progress_update as you work."],
          artifacts: [],
          data: result,
        };
      }
      const summary =
        `Resumed ${resolved.feature}` +
        (resolved.repo ? ` (repo ${resolved.repo}, ${resolved.how})` : ` (${resolved.how})`) +
        (recall.progress ? `: ${recall.progress.last_action}` : ": no progress yet");
      return {
        status: "success",
        summary,
        next_actions: ["Read recall.progress.next_step", "context_set if you switch feature"],
        artifacts: resolved.feature ? [`features/${resolved.feature}/working/current.md`] : [],
        data: result,
      };
    },
  };
}
```

- [ ] **Step 4: Register in `src/tools/index.ts`**

Add the import after the existing tool imports:

```ts
import { agentRecallTool } from "./agent-recall.js";
```

Add to the `registerTools` return array (after `instinctSaveTool(ctx),`):

```ts
    agentRecallTool(ctx),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/agent-recall-tool.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/tools/agent-recall.ts src/tools/index.ts tests/agent-recall-tool.test.ts
git commit -m "feat: add agent_recall MCP tool"
```

---

### Task 5: Wire `context_set` + `progress_update` to record activity

**Files:**
- Modify: `src/tools/context-set.ts`
- Modify: `src/tools/progress-update.ts`
- Test: `tests/recency-wiring.test.ts`

**Interfaces:**
- Consumes: `recordFeatureActivity` (Task 2). Both tool handlers call it after their main domain action, before returning.
- Produces: no new exports — behavior change only (after these tools run, the feature's repos carry `active_feature` and the feature's `updated_at` is bumped).

- [ ] **Step 1: Write the failing test**

Create `tests/recency-wiring.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/recency-wiring.test.js`
Expected: FAIL — `active_feature` is not set yet (wiring not added).

- [ ] **Step 3: Wire `context_set`**

In `src/tools/context-set.ts`, add the import:

```ts
import { recordFeatureActivity } from "../domain/recency.js";
```

In the handler, after `const feature = await resolveFeature({ ... });` and before the `return`, add:

```ts
      await recordFeatureActivity(feature.slug);
```

- [ ] **Step 4: Wire `progress_update`**

In `src/tools/progress-update.ts`, add the import:

```ts
import { recordFeatureActivity } from "../domain/recency.js";
```

In the handler, after `const progress = await writeProgress({ ... });` and before the `return`, add:

```ts
      await recordFeatureActivity(progress.feature);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/recency-wiring.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the whole suite + typecheck**

Run: `npm run build && node --test dist/tests/*.test.js && npm run typecheck`
Expected: ALL tests pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/tools/context-set.ts src/tools/progress-update.ts tests/recency-wiring.test.ts
git commit -m "feat: context_set + progress_update record feature activity"
```

---

### Task 6: Write `memory-protocol.md`

**Files:**
- Create: `memory-protocol.md` (repo root)

**Interfaces:** none (documentation artifact, the cross-CLI instruction source).

- [ ] **Step 1: Create the protocol file**

Create `memory-protocol.md` at the repo root with exactly this content:

````markdown
# Agent Memory Protocol (obsidian-agent-gateway)

You have a persistent memory via the `obsidian-agent-gateway` MCP server. Follow this protocol so
work survives across sessions and CLIs. Keep it low-noise: only act at the moments below.

## LOAD — at session start, or when asked "what was I doing / continue / which repo"
- Call `agent_recall` with your current working directory (`cwd`). It resolves the repo + the feature
  you last worked on and returns: last action, next step, knowledge pointers, top instincts.
- Call it ONCE per session and reuse the result. Do not re-recall unless the feature changes.
- You do NOT need to know the feature slug — `agent_recall` resolves it.

## SWITCH — when the user clearly moves to a different feature/initiative
- Call `context_set(feature, repos, paths)` with a short kebab-case feature label and the repo slugs
  it spans (e.g. a feature touching two repos lists both).

## SAVE — at meaningful boundaries only (NOT every message)
- `progress_update(feature, last_action, next_step)` — when a meaningful step/task completes, when
  switching tasks, and when wrapping up. Save INCREMENTALLY at each boundary; do not wait for the end
  (the session may stop first).
- `knowledge_save(repo, area, body, source_paths)` — when you learn a durable codebase fact worth
  reusing (architecture, convention, gotcha, run/test command).
- `instinct_save(slug, title, trigger, action, why)` — when you hit friction and found a better way to
  WORK (re-saving the same slug reinforces it).

## DO NOT
- Save on every message, or save trivial/obvious facts, raw tool output, or secrets.
- Recall repeatedly within a session.
- Invent feature slugs — let `agent_recall` resolve them.

## The test for saving
Save something only if the NEXT session would need it to continue.
````

- [ ] **Step 2: Verify the file**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('memory-protocol.md','utf8');if(!/agent_recall/.test(s)||!/progress_update/.test(s)||!/DO NOT/.test(s))process.exit(1);console.log('protocol ok')"`
Expected: prints `protocol ok` (exit 0).

- [ ] **Step 3: Commit**

```bash
git add memory-protocol.md
git commit -m "docs: add cross-CLI agent memory protocol"
```

---

## Self-Review

**Spec coverage:**
- §3(A) `agent_recall(cwd)` front door → Tasks 3 & 4. ✓
- §3(B) `memory-protocol.md` → Task 6. ✓
- §3(C) global-instruction install → handled post-merge as an interactive step with the user (edits `~/.claude/CLAUDE.md` + OpenCode/Codex global `AGENTS.md`); not a subagent task because it changes the user's environment outside the repo. ✓ (noted)
- §4 scope resolution (active_feature per repo; global-recent fallback; none) → Tasks 1, 3. ✓
- §4 `context_set`/`progress_update` bump recency → Tasks 2, 5. ✓
- §5 `active_feature` on repo entry → Task 1. ✓
- §5 `agent_recall` response shape (`resolved` + `recall`) → Tasks 3, 4. ✓
- §8 error handling (warning on none, missing cwd) → Task 4. ✓
- §9 testing → each task's tests + Task 5 whole-suite gate. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete; the `__none__` sentinel is intentional (a slug that cannot exist, so `recall` returns instincts-only).

**Type consistency:** `RepoEntry.active_feature?`, `setRepoActiveFeature`/`touchFeatureUpdatedAt`/`getMostRecentFeature` (Task 1) are consumed by Tasks 2 & 3 with matching signatures. `recordFeatureActivity` (Task 2) is consumed by Task 5. `agentRecall`/`AgentRecallResult`/`RecallHow` (Task 3) are consumed by Task 4. `recall` reused unchanged. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-agent-gateway-auto-recall.md`. This builds the `agent_recall` front door + recency wiring + the cross-CLI protocol; the global-instruction install (`~/.claude/CLAUDE.md`, OpenCode/Codex `AGENTS.md`) is a final interactive step after merge.

Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
