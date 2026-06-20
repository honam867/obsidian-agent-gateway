# Agent Gateway — Memory Tiers (additive) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the memory tiers (working / knowledge / instincts) and their MCP tools on top of the Plan 1 scope substrate, additively, so an agent can record "what I did last", store codebase knowledge, accumulate self-improvement instincts, and recall them on a new session — without touching the existing project/plan/task code.

**Architecture:** New domain modules read/write markdown-with-frontmatter under the feature/repo/global folders created in Plan 1. New MCP tools wrap them and resolve a `feature` via the Plan 1 `resolveFeature`. Tools return the harness observation contract. Existing tools and the `project/plan/task` machinery are untouched — this is purely additive. (The project→feature swap and lessons/playbooks tiers are deferred to later plans.)

**Tech Stack:** TypeScript (strict, ESM `NodeNext`), `gray-matter`, `write-file-atomic`, `zod`, `node:test`.

## Global Constraints

- Node `>=20`; TypeScript `strict`; `module`/`moduleResolution` = `NodeNext` (import sibling modules with the `.js` extension).
- Tests are compiled to `dist/tests/` and run with `node --test`; always `npm run build` before running a test. Test cycle: `npm run build && node --test dist/tests/<file>.test.js`.
- This repo's code style uses `?.` / `??` freely.
- Frontmatter is written via `writeMarkdown(path, data, body)`; read via `readMarkdown<T>(path)` (returns `null` if the file is missing). `undefined` frontmatter values must be stripped before writing (gray-matter/js-yaml throws on `undefined`).
- ADDITIVE ONLY: do not modify `domain/project.ts`, `domain/plan.ts`, `domain/task.ts`, `vault/project-registry.ts`, or any existing `tools/*` file except `tools/index.ts` (to register new tools).
- Every NEW MCP tool returns the observation contract: `{ status: "success"|"warning"|"error", summary: string, next_actions: string[], artifacts: string[], data?: ... }`.
- Scope is resolved with `resolveFeature` / `getFeature` from `src/domain/feature.js` (Plan 1). A feature owns `working` + `lessons`; a repo owns `knowledge`; `instincts` are global.

---

### Task 1: Memory-tier vault paths

**Files:**
- Modify: `src/vault/paths.ts`
- Test: `tests/paths-memory.test.ts`

**Interfaces:**
- Consumes: existing `featuresDir`, `reposDir`, `instinctsDir` locals/members from Plan 1.
- Produces: `VaultPaths` gains
  `featureWorkingDir(slug: string): string`,
  `featureCurrentFile(slug: string): string`,
  `repoKnowledgeDir(repo: string): string`,
  `repoKnowledgeFile(repo: string, area: string): string`,
  `instinctFile(slug: string): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/paths-memory.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { makeVaultPaths } from "../src/vault/paths.js";

const root = path.resolve("/vault");
const p = makeVaultPaths("/vault");

test("feature working paths", () => {
  assert.equal(p.featureWorkingDir("misa-payout"), path.join(root, "features", "misa-payout", "working"));
  assert.equal(
    p.featureCurrentFile("misa-payout"),
    path.join(root, "features", "misa-payout", "working", "current.md"),
  );
});

test("repo knowledge paths", () => {
  assert.equal(p.repoKnowledgeDir("cozrum-server"), path.join(root, "repos", "cozrum-server", "knowledge"));
  assert.equal(
    p.repoKnowledgeFile("cozrum-server", "misa-prepare"),
    path.join(root, "repos", "cozrum-server", "knowledge", "misa-prepare.md"),
  );
});

test("instinct file path", () => {
  assert.equal(p.instinctFile("forward-slash-paths"), path.join(root, "global", "instincts", "forward-slash-paths.md"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/paths-memory.test.js`
Expected: FAIL — the new members are `undefined`.

- [ ] **Step 3: Add the new path members**

In `src/vault/paths.ts`, add to the `VaultPaths` interface (after `instinctsDir: string;`):

```ts
  featureWorkingDir(slug: string): string;
  featureCurrentFile(slug: string): string;
  repoKnowledgeDir(repo: string): string;
  repoKnowledgeFile(repo: string, area: string): string;
  instinctFile(slug: string): string;
```

In `makeVaultPaths`, add to the returned object (after `instinctsDir: path.join(globalDir, "instincts"),`):

```ts
    featureWorkingDir: (slug) => path.join(featuresDir, slug, "working"),
    featureCurrentFile: (slug) => path.join(featuresDir, slug, "working", "current.md"),
    repoKnowledgeDir: (repo) => path.join(reposDir, repo, "knowledge"),
    repoKnowledgeFile: (repo, area) => path.join(reposDir, repo, "knowledge", `${area}.md`),
    instinctFile: (slug) => path.join(globalDir, "instincts", `${slug}.md`),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tests/paths-memory.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vault/paths.ts tests/paths-memory.test.ts
git commit -m "feat: add memory-tier vault paths (working/knowledge/instinct)"
```

---

### Task 2: Working-memory domain (current.md)

**Files:**
- Create: `src/domain/working.ts`
- Test: `tests/working-domain.test.ts`

**Interfaces:**
- Consumes: `getPaths().featureCurrentFile` (Task 1); `readMarkdown`, `writeMarkdown` from `vault/vault-io.js`; `nowIso` from `utils/time.js`; `initVault` for the test.
- Produces:
  - `interface ProgressInput { feature: string; lastAction: string; nextStep: string; activeTask?: string; session?: string }`
  - `interface Progress { feature: string; session: string | null; updated_at: string; active_task: string | null; last_action: string; next_step: string }`
  - `writeProgress(input: ProgressInput): Promise<Progress>` — overwrites `working/current.md` (frontmatter = the Progress fields, body = a human-readable summary).
  - `readProgress(feature: string): Promise<Progress | null>` — returns `null` when no `current.md` exists.

- [ ] **Step 1: Write the failing test**

Create `tests/working-domain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { writeProgress, readProgress } from "../src/domain/working.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-working-"));
  await initVault(dir);
}

test("readProgress returns null when nothing written", async () => {
  await freshVault();
  assert.equal(await readProgress("misa-payout"), null);
});

test("writeProgress then readProgress round-trips the fields", async () => {
  await freshVault();
  const written = await writeProgress({
    feature: "misa-payout",
    lastAction: "Added blockIds to prepare payload",
    nextStep: "Trace resolveTargetForPayout for cash",
    activeTask: "003-cash-prepare",
    session: "claude-xy",
  });
  assert.equal(written.feature, "misa-payout");
  assert.equal(written.last_action, "Added blockIds to prepare payload");
  assert.equal(written.active_task, "003-cash-prepare");

  const read = await readProgress("misa-payout");
  assert.equal(read?.last_action, "Added blockIds to prepare payload");
  assert.equal(read?.next_step, "Trace resolveTargetForPayout for cash");
  assert.equal(read?.session, "claude-xy");
});

test("writeProgress overwrites and defaults optional fields to null", async () => {
  await freshVault();
  await writeProgress({ feature: "f1", lastAction: "a1", nextStep: "n1" });
  const second = await writeProgress({ feature: "f1", lastAction: "a2", nextStep: "n2" });
  assert.equal(second.active_task, null);
  assert.equal(second.session, null);
  const read = await readProgress("f1");
  assert.equal(read?.last_action, "a2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/working-domain.test.js`
Expected: build error — `src/domain/working.js` does not exist.

- [ ] **Step 3: Implement the module**

`src/domain/working.ts`:

```ts
import { getPaths, readMarkdown, writeMarkdown } from "../vault/vault-io.js";
import { nowIso } from "../utils/time.js";

export interface ProgressInput {
  feature: string;
  lastAction: string;
  nextStep: string;
  activeTask?: string;
  session?: string;
}

export interface Progress {
  feature: string;
  session: string | null;
  updated_at: string;
  active_task: string | null;
  last_action: string;
  next_step: string;
}

export async function writeProgress(input: ProgressInput): Promise<Progress> {
  const progress: Progress = {
    feature: input.feature,
    session: input.session ?? null,
    updated_at: nowIso(),
    active_task: input.activeTask ?? null,
    last_action: input.lastAction,
    next_step: input.nextStep,
  };
  const body = [
    `# Working memory — ${input.feature}`,
    "",
    `**Last action:** ${input.lastAction}`,
    "",
    `**Next step:** ${input.nextStep}`,
    "",
  ].join("\n");
  await writeMarkdown(
    getPaths().featureCurrentFile(input.feature),
    progress as unknown as Record<string, unknown>,
    body,
  );
  return progress;
}

export async function readProgress(feature: string): Promise<Progress | null> {
  const parsed = await readMarkdown<Progress>(getPaths().featureCurrentFile(feature));
  return parsed?.data ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/working-domain.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/working.ts tests/working-domain.test.ts
git commit -m "feat: add working-memory domain (current.md progress)"
```

---

### Task 3: Knowledge domain (repo codebase facts)

**Files:**
- Create: `src/domain/knowledge.ts`
- Test: `tests/knowledge-domain.test.ts`

**Interfaces:**
- Consumes: `getPaths().repoKnowledgeFile` + `repoKnowledgeDir` (Task 1); `readMarkdown`, `writeMarkdown`, `listFiles` from `vault/vault-io.js`; `nowIso`; `slugify` from `utils/slug.js`.
- Produces:
  - `interface KnowledgeInput { repo: string; area: string; body: string; sourcePaths?: string[]; tags?: string[] }`
  - `interface KnowledgeFm { id: string; repo: string; area: string; source_paths: string[]; verified_at: string; stale: boolean; tags: string[] }`
  - `interface KnowledgePointer { id: string; repo: string; area: string; source_paths: string[]; stale: boolean }`
  - `saveKnowledge(input: KnowledgeInput): Promise<KnowledgeFm>` — upsert `repos/<repo>/knowledge/<area>.md` (area is slugified for the filename; `id` = the slugified area).
  - `getKnowledge(repo: string, area: string): Promise<{ data: KnowledgeFm; content: string } | null>`
  - `listKnowledge(repo: string): Promise<KnowledgePointer[]>` — pointers only (no body), for just-in-time recall.

- [ ] **Step 1: Write the failing test**

Create `tests/knowledge-domain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { saveKnowledge, getKnowledge, listKnowledge } from "../src/domain/knowledge.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-knowledge-"));
  await initVault(dir);
}

test("saveKnowledge writes and getKnowledge reads it back", async () => {
  await freshVault();
  const fm = await saveKnowledge({
    repo: "cozrum-server",
    area: "MISA Prepare",
    body: "Prepare links payout to transaction via payAccountId.",
    sourcePaths: ["src/controllers/finance/misa_payout/index.js"],
    tags: ["misa", "payout"],
  });
  assert.equal(fm.id, "misa-prepare");
  assert.equal(fm.repo, "cozrum-server");
  assert.equal(fm.stale, false);
  assert.deepEqual(fm.source_paths, ["src/controllers/finance/misa_payout/index.js"]);

  const got = await getKnowledge("cozrum-server", "MISA Prepare");
  assert.match(got?.content ?? "", /payAccountId/);
});

test("saveKnowledge upserts the same area (no duplicate file)", async () => {
  await freshVault();
  await saveKnowledge({ repo: "r1", area: "arch", body: "v1" });
  await saveKnowledge({ repo: "r1", area: "arch", body: "v2" });
  const pointers = await listKnowledge("r1");
  assert.equal(pointers.length, 1);
  const got = await getKnowledge("r1", "arch");
  assert.match(got?.content ?? "", /v2/);
});

test("listKnowledge returns pointers without body", async () => {
  await freshVault();
  await saveKnowledge({ repo: "r2", area: "a", body: "x", sourcePaths: ["p"] });
  await saveKnowledge({ repo: "r2", area: "b", body: "y" });
  const pointers = await listKnowledge("r2");
  assert.deepEqual(pointers.map((p) => p.id).sort(), ["a", "b"]);
  assert.deepEqual(pointers.find((p) => p.id === "a")?.source_paths, ["p"]);
});

test("listKnowledge returns [] for an unknown repo", async () => {
  await freshVault();
  assert.deepEqual(await listKnowledge("nope"), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/knowledge-domain.test.js`
Expected: build error — module missing.

- [ ] **Step 3: Implement the module**

`src/domain/knowledge.ts`:

```ts
import { getPaths, readMarkdown, writeMarkdown, listFiles } from "../vault/vault-io.js";
import { nowIso } from "../utils/time.js";
import { slugify } from "../utils/slug.js";

export interface KnowledgeInput {
  repo: string;
  area: string;
  body: string;
  sourcePaths?: string[];
  tags?: string[];
}

export interface KnowledgeFm {
  id: string;
  repo: string;
  area: string;
  source_paths: string[];
  verified_at: string;
  stale: boolean;
  tags: string[];
}

export interface KnowledgePointer {
  id: string;
  repo: string;
  area: string;
  source_paths: string[];
  stale: boolean;
}

export async function saveKnowledge(input: KnowledgeInput): Promise<KnowledgeFm> {
  const id = slugify(input.area) || "knowledge";
  const fm: KnowledgeFm = {
    id,
    repo: input.repo,
    area: input.area,
    source_paths: input.sourcePaths ?? [],
    verified_at: nowIso(),
    stale: false,
    tags: input.tags ?? [],
  };
  const body = [`# ${input.area}`, "", input.body, ""].join("\n");
  await writeMarkdown(
    getPaths().repoKnowledgeFile(input.repo, id),
    fm as unknown as Record<string, unknown>,
    body,
  );
  return fm;
}

export async function getKnowledge(
  repo: string,
  area: string,
): Promise<{ data: KnowledgeFm; content: string } | null> {
  const id = slugify(area) || "knowledge";
  const parsed = await readMarkdown<KnowledgeFm>(getPaths().repoKnowledgeFile(repo, id));
  return parsed ? { data: parsed.data, content: parsed.content } : null;
}

export async function listKnowledge(repo: string): Promise<KnowledgePointer[]> {
  const files = await listFiles(getPaths().repoKnowledgeDir(repo), ".md");
  const out: KnowledgePointer[] = [];
  for (const file of files) {
    const id = file.replace(/\.md$/, "");
    const parsed = await readMarkdown<KnowledgeFm>(getPaths().repoKnowledgeFile(repo, id));
    if (!parsed) continue;
    out.push({
      id: parsed.data.id,
      repo: parsed.data.repo,
      area: parsed.data.area,
      source_paths: parsed.data.source_paths ?? [],
      stale: parsed.data.stale ?? false,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/knowledge-domain.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/knowledge.ts tests/knowledge-domain.test.ts
git commit -m "feat: add knowledge domain (repo codebase facts)"
```

---

### Task 4: Instinct domain (self-improvement, with confidence)

**Files:**
- Create: `src/domain/instinct.ts`
- Test: `tests/instinct-domain.test.ts`

**Interfaces:**
- Consumes: `getPaths().instinctFile` + `instinctsDir` (Task 1 / Plan 1); `readMarkdown`, `writeMarkdown`, `listFiles`; `nowIso`; `slugify`.
- Produces:
  - `interface InstinctInput { slug: string; title: string; trigger: string; action: string; why: string; tags?: string[] }`
  - `interface InstinctFm { id: string; title: string; confidence: number; observations: number; status: "active" | "retired"; last_reinforced_at: string; created_at: string; tags: string[] }`
  - `saveInstinct(input: InstinctInput): Promise<InstinctFm>` — if the slug is new, create with `confidence: 0.5`, `observations: 1`; if it exists, REINFORCE: `observations + 1`, `confidence = min(1, confidence + (1 - confidence) * 0.5)`, bump `last_reinforced_at`, keep `created_at`.
  - `listTopInstincts(limit: number): Promise<InstinctFm[]>` — `status === "active"`, sorted by `confidence` desc then `observations` desc, capped at `limit`.

- [ ] **Step 1: Write the failing test**

Create `tests/instinct-domain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { saveInstinct, listTopInstincts } from "../src/domain/instinct.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-instinct-"));
  await initVault(dir);
}

test("first save creates with confidence 0.5 and 1 observation", async () => {
  await freshVault();
  const fm = await saveInstinct({
    slug: "forward-slash-paths",
    title: "Use forward-slash node paths on Windows",
    trigger: "Running node on Windows",
    action: "Use D:/working/... not backslashes",
    why: "Bash eats backslashes",
  });
  assert.equal(fm.id, "forward-slash-paths");
  assert.equal(fm.confidence, 0.5);
  assert.equal(fm.observations, 1);
  assert.equal(fm.status, "active");
});

test("re-saving the same slug reinforces (confidence up, observations up, created_at kept)", async () => {
  await freshVault();
  const first = await saveInstinct({ slug: "s1", title: "t", trigger: "x", action: "y", why: "z" });
  const second = await saveInstinct({ slug: "s1", title: "t", trigger: "x", action: "y", why: "z" });
  assert.equal(second.observations, 2);
  assert.ok(second.confidence > first.confidence);
  assert.equal(second.confidence, 0.75); // 0.5 + (1-0.5)*0.5
  assert.equal(second.created_at, first.created_at);
});

test("listTopInstincts sorts by confidence desc and respects limit", async () => {
  await freshVault();
  await saveInstinct({ slug: "low", title: "t", trigger: "x", action: "y", why: "z" }); // 0.5
  await saveInstinct({ slug: "high", title: "t", trigger: "x", action: "y", why: "z" });
  await saveInstinct({ slug: "high", title: "t", trigger: "x", action: "y", why: "z" }); // 0.75
  const top = await listTopInstincts(1);
  assert.equal(top.length, 1);
  assert.equal(top[0].id, "high");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/instinct-domain.test.js`
Expected: build error — module missing.

- [ ] **Step 3: Implement the module**

`src/domain/instinct.ts`:

```ts
import { getPaths, readMarkdown, writeMarkdown, listFiles } from "../vault/vault-io.js";
import { nowIso } from "../utils/time.js";
import { slugify } from "../utils/slug.js";

export interface InstinctInput {
  slug: string;
  title: string;
  trigger: string;
  action: string;
  why: string;
  tags?: string[];
}

export interface InstinctFm {
  id: string;
  title: string;
  confidence: number;
  observations: number;
  status: "active" | "retired";
  last_reinforced_at: string;
  created_at: string;
  tags: string[];
}

function reinforce(confidence: number): number {
  return Math.min(1, confidence + (1 - confidence) * 0.5);
}

export async function saveInstinct(input: InstinctInput): Promise<InstinctFm> {
  const id = slugify(input.slug) || "instinct";
  const now = nowIso();
  const existing = await readMarkdown<InstinctFm>(getPaths().instinctFile(id));

  const fm: InstinctFm = existing
    ? {
        ...existing.data,
        title: input.title,
        confidence: reinforce(existing.data.confidence),
        observations: existing.data.observations + 1,
        status: existing.data.status ?? "active",
        last_reinforced_at: now,
        tags: input.tags ?? existing.data.tags ?? [],
      }
    : {
        id,
        title: input.title,
        confidence: 0.5,
        observations: 1,
        status: "active",
        last_reinforced_at: now,
        created_at: now,
        tags: input.tags ?? [],
      };

  const body = [
    `# ${input.title}`,
    "",
    "## Trigger",
    "",
    input.trigger,
    "",
    "## Action",
    "",
    input.action,
    "",
    "## Why",
    "",
    input.why,
    "",
  ].join("\n");

  await writeMarkdown(getPaths().instinctFile(id), fm as unknown as Record<string, unknown>, body);
  return fm;
}

export async function listTopInstincts(limit: number): Promise<InstinctFm[]> {
  const files = await listFiles(getPaths().instinctsDir, ".md");
  const out: InstinctFm[] = [];
  for (const file of files) {
    const id = file.replace(/\.md$/, "");
    const parsed = await readMarkdown<InstinctFm>(getPaths().instinctFile(id));
    if (!parsed) continue;
    if (parsed.data.status === "retired") continue;
    out.push(parsed.data);
  }
  out.sort((a, b) => b.confidence - a.confidence || b.observations - a.observations);
  return out.slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/instinct-domain.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/instinct.ts tests/instinct-domain.test.ts
git commit -m "feat: add instinct domain (self-improvement with confidence)"
```

---

### Task 5: Recall assembler (the session-startup bundle)

**Files:**
- Create: `src/domain/recall.ts`
- Test: `tests/recall-domain.test.ts`

**Interfaces:**
- Consumes: `getFeature` from `domain/feature.js`; `readProgress` (Task 2); `listKnowledge` (Task 3); `listTopInstincts` (Task 4); types `Progress`, `KnowledgePointer`, `InstinctFm`, `ResolvedFeature`.
- Produces:
  - `interface RecallBundle { feature: ResolvedFeature | null; progress: Progress | null; knowledge: KnowledgePointer[]; instincts: InstinctFm[] }`
  - `recall(feature: string, opts?: { instinctLimit?: number }): Promise<RecallBundle>` — loads the feature, its `current.md` progress, knowledge pointers for every repo the feature touches, and the top instincts (default limit 5). Returns `feature: null` when the feature is unknown (but still returns global instincts).

- [ ] **Step 1: Write the failing test**

Create `tests/recall-domain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { resolveFeature } from "../src/domain/feature.js";
import { writeProgress } from "../src/domain/working.js";
import { saveKnowledge } from "../src/domain/knowledge.js";
import { saveInstinct } from "../src/domain/instinct.js";
import { recall } from "../src/domain/recall.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-recall-"));
  await initVault(dir);
}

test("recall assembles feature + progress + knowledge + instincts", async () => {
  await freshVault();
  await resolveFeature({ slug: "misa-payout", title: "MISA Payout", repos: ["cozrum-server", "cozrum-cms"] });
  await writeProgress({ feature: "misa-payout", lastAction: "did X", nextStep: "do Y" });
  await saveKnowledge({ repo: "cozrum-server", area: "prepare", body: "...", sourcePaths: ["a.js"] });
  await saveInstinct({ slug: "i1", title: "t", trigger: "x", action: "y", why: "z" });

  const bundle = await recall("misa-payout");
  assert.equal(bundle.feature?.slug, "misa-payout");
  assert.equal(bundle.progress?.last_action, "did X");
  assert.deepEqual(bundle.knowledge.map((k) => k.id), ["prepare"]);
  assert.equal(bundle.instincts.length, 1);
});

test("recall on unknown feature returns null feature but still global instincts", async () => {
  await freshVault();
  await saveInstinct({ slug: "g1", title: "t", trigger: "x", action: "y", why: "z" });
  const bundle = await recall("nope");
  assert.equal(bundle.feature, null);
  assert.equal(bundle.progress, null);
  assert.deepEqual(bundle.knowledge, []);
  assert.equal(bundle.instincts.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/recall-domain.test.js`
Expected: build error — module missing.

- [ ] **Step 3: Implement the module**

`src/domain/recall.ts`:

```ts
import { getFeature, ResolvedFeature } from "./feature.js";
import { readProgress, Progress } from "./working.js";
import { listKnowledge, KnowledgePointer } from "./knowledge.js";
import { listTopInstincts, InstinctFm } from "./instinct.js";

export interface RecallBundle {
  feature: ResolvedFeature | null;
  progress: Progress | null;
  knowledge: KnowledgePointer[];
  instincts: InstinctFm[];
}

export async function recall(
  feature: string,
  opts?: { instinctLimit?: number },
): Promise<RecallBundle> {
  const resolved = await getFeature(feature);
  const progress = resolved ? await readProgress(feature) : null;

  const knowledge: KnowledgePointer[] = [];
  if (resolved) {
    for (const repo of resolved.repos) {
      const pointers = await listKnowledge(repo);
      for (const p of pointers) knowledge.push(p);
    }
  }

  const instincts = await listTopInstincts(opts?.instinctLimit ?? 5);

  return { feature: resolved, progress, knowledge, instincts };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/recall-domain.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/recall.ts tests/recall-domain.test.ts
git commit -m "feat: add recall assembler (session-startup bundle)"
```

---

### Task 6: Context + working/recall tools

**Files:**
- Create: `src/tools/context-set.ts`
- Create: `src/tools/progress-update.ts`
- Create: `src/tools/memory-recall.ts`
- Modify: `src/tools/index.ts`
- Test: `tests/memory-tools.test.ts`

**Interfaces:**
- Consumes: `ToolContext`, `ToolDef` from `tools/types.js`; `resolveFeature` from `domain/feature.js`; `writeProgress` (Task 2); `recall` (Task 5); `registerTools` from `tools/index.js` for the test.
- Produces three `ToolDef` factories — `contextSetTool(ctx)`, `progressUpdateTool(ctx)`, `memoryRecallTool(ctx)` — registered in `registerTools`. Each handler returns the observation contract `{ status, summary, next_actions, artifacts, data }`.

- [ ] **Step 1: Write the failing test**

Create `tests/memory-tools.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/memory-tools.test.js`
Expected: build error — the new tool modules / registrations do not exist.

- [ ] **Step 3: Create `src/tools/context-set.ts`**

```ts
import { z } from "zod";
import { resolveFeature } from "../domain/feature.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  title: z.string().optional(),
  repos: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
});

export function contextSetTool(_ctx: ToolContext): ToolDef {
  return {
    name: "context_set",
    description:
      "Set or create the active feature/initiative (a cross-repo label, e.g. 'misa-payout'). Resolves the feature, merging in any repos/paths provided. Call this when starting work on a feature so later memory tools know the scope.",
    annotations: { title: "Context Set", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug/label, e.g. 'misa-payout'." },
        title: { type: "string", description: "Human-readable title (defaults to the feature label)." },
        repos: { type: "array", items: { type: "string" }, description: "Repo slugs this feature spans." },
        paths: { type: "array", items: { type: "string" }, description: "Relevant paths inside the repos." },
      },
      required: ["feature"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide a non-empty 'feature'."], artifacts: [] };
      }
      const input = parsed.data;
      const feature = await resolveFeature({
        slug: input.feature,
        title: input.title,
        repos: input.repos,
        paths: input.paths,
      });
      return {
        status: "success",
        summary: `Active feature: ${feature.slug} (${feature.repos.length} repo(s))`,
        next_actions: ["Call progress_update as you work", "Call memory_recall to load context"],
        artifacts: [`features/${feature.slug}/_feature.md`],
        data: { feature },
      };
    },
  };
}
```

- [ ] **Step 4: Create `src/tools/progress-update.ts`**

```ts
import { z } from "zod";
import { writeProgress } from "../domain/working.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  last_action: z.string().min(1),
  next_step: z.string().min(1),
  active_task: z.string().optional(),
  session: z.string().optional(),
});

export function progressUpdateTool(_ctx: ToolContext): ToolDef {
  return {
    name: "progress_update",
    description:
      "Record what you just did and what's next for a feature (overwrites working/current.md). Call this at phase boundaries and before context runs out, so the next session knows where you stopped.",
    annotations: { title: "Progress Update", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug, e.g. 'misa-payout'." },
        last_action: { type: "string", description: "What you just did." },
        next_step: { type: "string", description: "The next concrete step." },
        active_task: { type: "string", description: "Optional task id you're on." },
        session: { type: "string", description: "Optional CLI session id." },
      },
      required: ["feature", "last_action", "next_step"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide feature, last_action, next_step."], artifacts: [] };
      }
      const input = parsed.data;
      const progress = await writeProgress({
        feature: input.feature,
        lastAction: input.last_action,
        nextStep: input.next_step,
        activeTask: input.active_task,
        session: input.session,
      });
      return {
        status: "success",
        summary: `Progress saved for ${input.feature}`,
        next_actions: ["Continue working", "memory_recall next session to resume"],
        artifacts: [`features/${input.feature}/working/current.md`],
        data: { progress },
      };
    },
  };
}
```

- [ ] **Step 5: Create `src/tools/memory-recall.ts`**

```ts
import { z } from "zod";
import { recall } from "../domain/recall.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  instinct_limit: z.number().int().positive().optional(),
});

export function memoryRecallTool(_ctx: ToolContext): ToolDef {
  return {
    name: "memory_recall",
    description:
      "Load the working context for a feature: last progress (what you did / next step), knowledge pointers for its repos, and top global instincts. Call this FIRST when resuming a feature instead of re-reading the codebase.",
    annotations: { title: "Memory Recall", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug, e.g. 'misa-payout'." },
        instinct_limit: { type: "number", description: "Max instincts to return (default 5)." },
      },
      required: ["feature"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide a non-empty 'feature'."], artifacts: [] };
      }
      const bundle = await recall(parsed.data.feature, { instinctLimit: parsed.data.instinct_limit });
      const summary = bundle.feature
        ? `${bundle.feature.slug}: ${bundle.progress ? "has progress" : "no progress yet"}, ${bundle.knowledge.length} knowledge, ${bundle.instincts.length} instincts`
        : `Unknown feature; returning ${bundle.instincts.length} global instincts`;
      return {
        status: bundle.feature ? "success" : "warning",
        summary,
        next_actions: bundle.feature
          ? ["Read progress.next_step", "Pull full knowledge with memory_get if needed"]
          : ["Call context_set to create the feature"],
        artifacts: bundle.feature ? [`features/${bundle.feature.slug}/working/current.md`] : [],
        data: bundle,
      };
    },
  };
}
```

- [ ] **Step 6: Register the three tools in `src/tools/index.ts`**

Add these imports after the existing tool imports:

```ts
import { contextSetTool } from "./context-set.js";
import { progressUpdateTool } from "./progress-update.js";
import { memoryRecallTool } from "./memory-recall.js";
```

Add to the returned array in `registerTools` (after `projectRelinkTool(ctx),`):

```ts
    contextSetTool(ctx),
    progressUpdateTool(ctx),
    memoryRecallTool(ctx),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/memory-tools.test.js`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add src/tools/context-set.ts src/tools/progress-update.ts src/tools/memory-recall.ts src/tools/index.ts tests/memory-tools.test.ts
git commit -m "feat: add context_set, progress_update, memory_recall tools"
```

---

### Task 7: Knowledge + instinct save tools

**Files:**
- Create: `src/tools/knowledge-save.ts`
- Create: `src/tools/instinct-save.ts`
- Modify: `src/tools/index.ts`
- Test: `tests/memory-save-tools.test.ts`

**Interfaces:**
- Consumes: `ToolContext`, `ToolDef`; `saveKnowledge` (Task 3); `saveInstinct` (Task 4); `registerTools` for the test.
- Produces `knowledgeSaveTool(ctx)` and `instinctSaveTool(ctx)` registered in `registerTools`, each returning the observation contract.

- [ ] **Step 1: Write the failing test**

Create `tests/memory-save-tools.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/memory-save-tools.test.js`
Expected: build error — the new tool modules / registrations do not exist.

- [ ] **Step 3: Create `src/tools/knowledge-save.ts`**

```ts
import { z } from "zod";
import { saveKnowledge } from "../domain/knowledge.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  repo: z.string().min(1),
  area: z.string().min(1),
  body: z.string().min(1),
  source_paths: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export function knowledgeSaveTool(_ctx: ToolContext): ToolDef {
  return {
    name: "knowledge_save",
    description:
      "Save a durable codebase fact for a repo (architecture, convention, gotcha, run/test command). Keyed by repo + area, upserted. Record only high-signal facts, not raw output.",
    annotations: { title: "Knowledge Save", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo slug, e.g. 'cozrum-server'." },
        area: { type: "string", description: "Topic/area, e.g. 'misa-prepare'." },
        body: { type: "string", description: "The fact, in markdown." },
        source_paths: { type: "array", items: { type: "string" }, description: "Files this fact is about." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["repo", "area", "body"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide repo, area, body."], artifacts: [] };
      }
      const input = parsed.data;
      const knowledge = await saveKnowledge({
        repo: input.repo,
        area: input.area,
        body: input.body,
        sourcePaths: input.source_paths,
        tags: input.tags,
      });
      return {
        status: "success",
        summary: `Knowledge saved: ${input.repo}/${knowledge.id}`,
        next_actions: ["memory_recall surfaces this as a pointer next session"],
        artifacts: [`repos/${input.repo}/knowledge/${knowledge.id}.md`],
        data: { knowledge },
      };
    },
  };
}
```

- [ ] **Step 4: Create `src/tools/instinct-save.ts`**

```ts
import { z } from "zod";
import { saveInstinct } from "../domain/instinct.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  trigger: z.string().min(1),
  action: z.string().min(1),
  why: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export function instinctSaveTool(_ctx: ToolContext): ToolDef {
  return {
    name: "instinct_save",
    description:
      "Save a self-improvement instinct about HOW you should work (cross-project, global). Use when you hit friction and found a better way. Re-saving the same slug reinforces it (confidence up). Format: trigger -> action -> why.",
    annotations: { title: "Instinct Save", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Stable id, e.g. 'forward-slash-paths'." },
        title: { type: "string", description: "Short title." },
        trigger: { type: "string", description: "When this applies." },
        action: { type: "string", description: "What to do." },
        why: { type: "string", description: "Why it works." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["slug", "title", "trigger", "action", "why"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide slug, title, trigger, action, why."], artifacts: [] };
      }
      const input = parsed.data;
      const instinct = await saveInstinct(input);
      return {
        status: "success",
        summary: `Instinct '${instinct.id}' saved (confidence ${instinct.confidence}, ${instinct.observations} obs)`,
        next_actions: ["Top instincts load via memory_recall next session"],
        artifacts: [`global/instincts/${instinct.id}.md`],
        data: { instinct },
      };
    },
  };
}
```

- [ ] **Step 5: Register the two tools in `src/tools/index.ts`**

Add these imports after the Task 6 imports:

```ts
import { knowledgeSaveTool } from "./knowledge-save.js";
import { instinctSaveTool } from "./instinct-save.js";
```

Add to the returned array in `registerTools` (after `memoryRecallTool(ctx),`):

```ts
    knowledgeSaveTool(ctx),
    instinctSaveTool(ctx),
```

- [ ] **Step 6: Run the new test + the whole suite + typecheck**

Run: `npm run build && node --test dist/tests/memory-save-tools.test.js`
Expected: PASS (4 tests).

Then: `npm run build && node --test dist/tests/*.test.js && npm run typecheck`
Expected: ALL tests pass, no type errors (existing tools/tests untouched).

- [ ] **Step 7: Commit**

```bash
git add src/tools/knowledge-save.ts src/tools/instinct-save.ts src/tools/index.ts tests/memory-save-tools.test.ts
git commit -m "feat: add knowledge_save and instinct_save tools"
```

---

## Self-Review

**Spec coverage (this plan = the high-value, additive slice of §4/§9/§10):**
- working tier (current.md) → Tasks 2 & 6 (`progress_update`). ✓
- knowledge tier (repo facts) → Tasks 3 & 7 (`knowledge_save`). ✓
- instincts tier (self-improve + confidence/reinforce) → Tasks 4 & 7 (`instinct_save`). ✓
- read protocol / recall bundle (§8) → Tasks 5 & 6 (`memory_recall`). ✓
- active-context (§6) — partial: `context_set` (Task 6) sets it explicitly; auto-detect/suggest + `agent_boot` integration is deferred. ✓ (noted)
- observation contract (§10) → every new tool returns `status/summary/next_actions/artifacts`. ✓
- Deferred (out of this plan, by design): lessons + playbooks tiers, `memory_get`/`memory_search`, promotion, staleness invalidation by git, `agent_boot` rewrite, project→feature swap. These are follow-up plans.

**Placeholder scan:** No TBD/TODO; every code step is complete; generated markdown bodies contain author-facing prose, not plan placeholders. ✓

**Type consistency:** `Progress`, `KnowledgeFm`/`KnowledgePointer`, `InstinctFm`, `RecallBundle`, `ResolvedFeature` are defined once and imported by later tasks. Tool handlers return the same contract shape. `saveInstinct` reinforce math (`0.5 → 0.75`) matches the Task 4 test assertion. `resolveFeature`/`getFeature` signatures match Plan 1. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-agent-gateway-memory-tiers.md`. This is the additive memory-tiers slice (working + knowledge + instincts + recall + 5 new tools), built on the Plan 1 substrate, leaving existing plan/task untouched.

Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
