# Agent Gateway — Scope Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the new scope substrate (workspace → repos + features) the memory layer needs, as a self-contained, tested module that compiles alongside the existing project/plan/task code without changing it yet.

**Architecture:** A new `workspace.json` registry holds two maps — `repos` (auto-discovered git roots under the workspace) and `features` (free-form, cross-repo labels). New vault paths expose `features/`, `repos/`, `global/`. A `domain/feature.ts` module resolves/creates repos and features and writes their `_repo.md` / `_feature.md` docs. This plan is purely additive — `project.ts`, `plan.ts`, `task.ts`, and all tools keep working unchanged. Plan 2 swaps them onto features; Plan 3 adds the memory tiers.

**Tech Stack:** TypeScript (strict, ESM `NodeNext`), `gray-matter`, `write-file-atomic`, `zod`, `node:test`.

## Global Constraints

- Node `>=20`; TypeScript `strict`; `module`/`moduleResolution` = `NodeNext` (import sibling modules with the `.js` extension).
- Tests are compiled to `dist/tests/` and run with `node --test`; always `npm run build` before running a test.
- This repo's code style uses `?.` / `??` freely — match it (do NOT apply the cozrum-server lodash-only rule here).
- Vault layout (target): `features/<slug>/`, `repos/<slug>/`, `global/{playbooks,instincts}/`, `_index/workspace.json`.
- Frontmatter is written via `writeMarkdown(path, data, body)`; read via `readMarkdown<T>(path)` (returns `null` if missing).
- The singleton vault is initialized with `initVault(root)`; `getPaths()` throws until then.

---

### Task 1: New vault paths

**Files:**
- Modify: `src/vault/paths.ts`
- Test: `tests/paths.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `VaultPaths` gains
  `workspaceIndexFile: string`,
  `featuresDir: string`, `featureDir(slug: string): string`, `featureFile(slug: string): string`,
  `reposDir: string`, `repoDir(slug: string): string`, `repoFile(slug: string): string`,
  `globalDir: string`, `playbooksDir: string`, `instinctsDir: string`.

- [ ] **Step 1: Write the failing test**

Create `tests/paths.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { makeVaultPaths } from "../src/vault/paths.js";

const p = makeVaultPaths("/vault");

test("workspaceIndexFile lives under _index", () => {
  assert.equal(p.workspaceIndexFile, path.join("/vault", "_index", "workspace.json"));
});

test("feature paths", () => {
  assert.equal(p.featuresDir, path.join("/vault", "features"));
  assert.equal(p.featureDir("misa-payout"), path.join("/vault", "features", "misa-payout"));
  assert.equal(
    p.featureFile("misa-payout"),
    path.join("/vault", "features", "misa-payout", "_feature.md"),
  );
});

test("repo paths", () => {
  assert.equal(p.reposDir, path.join("/vault", "repos"));
  assert.equal(p.repoFile("cozrum-server"), path.join("/vault", "repos", "cozrum-server", "_repo.md"));
});

test("global paths", () => {
  assert.equal(p.globalDir, path.join("/vault", "global"));
  assert.equal(p.playbooksDir, path.join("/vault", "global", "playbooks"));
  assert.equal(p.instinctsDir, path.join("/vault", "global", "instincts"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/paths.test.js`
Expected: build error / FAIL — `p.workspaceIndexFile` etc. are `undefined` (properties don't exist yet).

- [ ] **Step 3: Add the new path members**

In `src/vault/paths.ts`, extend the `VaultPaths` interface (add after `taskFile`):

```ts
  workspaceIndexFile: string;
  featuresDir: string;
  featureDir(slug: string): string;
  featureFile(slug: string): string;
  reposDir: string;
  repoDir(slug: string): string;
  repoFile(slug: string): string;
  globalDir: string;
  playbooksDir: string;
  instinctsDir: string;
```

In `makeVaultPaths`, add these locals after `const indexFile = ...`:

```ts
  const featuresDir = path.join(root, "features");
  const reposDir = path.join(root, "repos");
  const globalDir = path.join(root, "global");
```

and add to the returned object (after `taskFile: ...`):

```ts
    workspaceIndexFile: path.join(indexDir, "workspace.json"),
    featuresDir,
    featureDir: (slug) => path.join(featuresDir, slug),
    featureFile: (slug) => path.join(featuresDir, slug, "_feature.md"),
    reposDir,
    repoDir: (slug) => path.join(reposDir, slug),
    repoFile: (slug) => path.join(reposDir, slug, "_repo.md"),
    globalDir,
    playbooksDir: path.join(globalDir, "playbooks"),
    instinctsDir: path.join(globalDir, "instincts"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tests/paths.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vault/paths.ts tests/paths.test.ts
git commit -m "feat: add feature/repo/global vault paths"
```

---

### Task 2: Schemas + workspace registry

**Files:**
- Create: `src/schemas/repo.ts`
- Create: `src/schemas/feature.ts`
- Create: `src/vault/workspace-registry.ts`
- Test: `tests/workspace-registry.test.ts`

**Interfaces:**
- Consumes: `getPaths().workspaceIndexFile` (Task 1); `readFileIfExists`, `writeAtomic` from `vault/atomic-write.js`; `initVault` for the test.
- Produces:
  - `schemas/repo.ts`: `RepoFrontmatter` (zod + type) with `{ slug, path, git_remote?, run_cmd?, test_cmd?, created_at, updated_at }`.
  - `schemas/feature.ts`: `FeatureStatus` = `"active"|"paused"|"done"`; `FeatureFrontmatter` `{ slug, title, repos[], paths[], status, created_at, updated_at }`.
  - `workspace-registry.ts`:
    `interface RepoEntry { slug; path; git_remote?; registered_at }`,
    `interface FeatureEntry { slug; title; repos: string[]; paths: string[]; status: string; created_at; updated_at }`,
    `registerRepoEntry(slug: string, absPath: string, gitRemote?: string): Promise<RepoEntry>`,
    `lookupRepoBySlug(slug): Promise<RepoEntry|null>`,
    `lookupRepoByPath(absPath): Promise<RepoEntry|null>`,
    `listRepoEntries(): Promise<RepoEntry[]>`,
    `upsertFeatureEntry(entry: FeatureEntry): Promise<FeatureEntry>`,
    `lookupFeatureBySlug(slug): Promise<FeatureEntry|null>`,
    `listFeatureEntries(): Promise<FeatureEntry[]>`.

- [ ] **Step 1: Write the failing test**

Create `tests/workspace-registry.test.ts`:

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
  lookupRepoByPath,
  listRepoEntries,
  upsertFeatureEntry,
  lookupFeatureBySlug,
  listFeatureEntries,
} from "../src/vault/workspace-registry.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-ws-"));
  await initVault(dir);
  return dir;
}

test("registers and looks up a repo by slug and path", async () => {
  await freshVault();
  const entry = await registerRepoEntry("cozrum-server", "D:/working/cozrum-server", "git@x:cozrum-server.git");
  assert.equal(entry.slug, "cozrum-server");
  assert.equal(entry.git_remote, "git@x:cozrum-server.git");
  assert.ok(entry.registered_at);

  const bySlug = await lookupRepoBySlug("cozrum-server");
  assert.equal(bySlug?.path, path.resolve("D:/working/cozrum-server"));
  const byPath = await lookupRepoByPath("D:/working/cozrum-server");
  assert.equal(byPath?.slug, "cozrum-server");
});

test("upserts and lists features", async () => {
  await freshVault();
  await upsertFeatureEntry({
    slug: "misa-payout",
    title: "MISA Payout",
    repos: ["cozrum-server"],
    paths: ["cozrum-server/src/misa"],
    status: "active",
    created_at: "2026-06-19T00:00:00.000Z",
    updated_at: "2026-06-19T00:00:00.000Z",
  });
  const found = await lookupFeatureBySlug("misa-payout");
  assert.equal(found?.title, "MISA Payout");
  assert.deepEqual(found?.repos, ["cozrum-server"]);

  const all = await listFeatureEntries();
  assert.equal(all.length, 1);
});

test("registry survives reload from disk", async () => {
  const dir = await freshVault();
  await registerRepoEntry("a-repo", path.join(dir, "a"));
  await initVault(dir); // simulate a fresh process pointing at the same vault
  const entries = await listRepoEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].slug, "a-repo");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/workspace-registry.test.js`
Expected: build error — `src/vault/workspace-registry.js` and schema modules do not exist.

- [ ] **Step 3: Create the schemas**

`src/schemas/repo.ts`:

```ts
import { z } from "zod";

export const RepoFrontmatter = z.object({
  slug: z.string(),
  path: z.string(),
  git_remote: z.string().optional(),
  run_cmd: z.string().optional(),
  test_cmd: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type RepoFrontmatter = z.infer<typeof RepoFrontmatter>;
```

`src/schemas/feature.ts`:

```ts
import { z } from "zod";

export const FeatureStatus = z.enum(["active", "paused", "done"]);
export type FeatureStatus = z.infer<typeof FeatureStatus>;

export const FeatureFrontmatter = z.object({
  slug: z.string(),
  title: z.string(),
  repos: z.array(z.string()),
  paths: z.array(z.string()),
  status: FeatureStatus,
  created_at: z.string(),
  updated_at: z.string(),
});

export type FeatureFrontmatter = z.infer<typeof FeatureFrontmatter>;
```

- [ ] **Step 4: Create the registry**

`src/vault/workspace-registry.ts`:

```ts
import path from "node:path";
import { getPaths } from "./vault-io.js";
import { readFileIfExists, writeAtomic } from "./atomic-write.js";

export interface RepoEntry {
  slug: string;
  path: string;
  git_remote?: string;
  registered_at: string;
}

export interface FeatureEntry {
  slug: string;
  title: string;
  repos: string[];
  paths: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceIndex {
  repos: Record<string, RepoEntry>;
  features: Record<string, FeatureEntry>;
}

async function readIndex(): Promise<WorkspaceIndex> {
  const raw = await readFileIfExists(getPaths().workspaceIndexFile);
  if (!raw) return { repos: {}, features: {} };
  try {
    const idx = JSON.parse(raw) as Partial<WorkspaceIndex>;
    return { repos: idx.repos ?? {}, features: idx.features ?? {} };
  } catch {
    return { repos: {}, features: {} };
  }
}

async function writeIndex(idx: WorkspaceIndex): Promise<void> {
  await writeAtomic(getPaths().workspaceIndexFile, JSON.stringify(idx, null, 2));
}

export async function registerRepoEntry(
  slug: string,
  absPath: string,
  gitRemote?: string,
): Promise<RepoEntry> {
  const idx = await readIndex();
  const entry: RepoEntry = {
    slug,
    path: path.resolve(absPath),
    git_remote: gitRemote,
    registered_at: new Date().toISOString(),
  };
  idx.repos[slug] = entry;
  await writeIndex(idx);
  return entry;
}

export async function lookupRepoBySlug(slug: string): Promise<RepoEntry | null> {
  const idx = await readIndex();
  return idx.repos[slug] ?? null;
}

export async function lookupRepoByPath(absPath: string): Promise<RepoEntry | null> {
  const normalized = path.resolve(absPath).toLowerCase();
  const idx = await readIndex();
  return (
    Object.values(idx.repos).find((r) => path.resolve(r.path).toLowerCase() === normalized) ?? null
  );
}

export async function listRepoEntries(): Promise<RepoEntry[]> {
  const idx = await readIndex();
  return Object.values(idx.repos).sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function upsertFeatureEntry(entry: FeatureEntry): Promise<FeatureEntry> {
  const idx = await readIndex();
  idx.features[entry.slug] = entry;
  await writeIndex(idx);
  return entry;
}

export async function lookupFeatureBySlug(slug: string): Promise<FeatureEntry | null> {
  const idx = await readIndex();
  return idx.features[slug] ?? null;
}

export async function listFeatureEntries(): Promise<FeatureEntry[]> {
  const idx = await readIndex();
  return Object.values(idx.features).sort((a, b) => a.slug.localeCompare(b.slug));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/workspace-registry.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/schemas/repo.ts src/schemas/feature.ts src/vault/workspace-registry.ts tests/workspace-registry.test.ts
git commit -m "feat: add repo/feature schemas and workspace registry"
```

---

### Task 3: Feature/repo domain (discover, register, resolve)

**Files:**
- Create: `src/domain/feature.ts`
- Test: `tests/feature-domain.test.ts`

**Interfaces:**
- Consumes: `discoverRepos` reads the filesystem under a workspace root; registry functions from Task 2; `getPaths().repoFile/featureFile` (Task 1); `slugify` from `utils/slug.js`; `nowIso` from `utils/time.js`; `fileExists` from `vault/atomic-write.js`; `writeMarkdown`/`readMarkdown` from `vault/vault-io.js`.
- Produces:
  - `interface DiscoveredRepo { slug: string; path: string }`
  - `discoverRepos(workspaceRoot: string): Promise<DiscoveredRepo[]>` — directories directly under `workspaceRoot` that contain a `.git` entry, sorted by slug.
  - `interface ResolvedRepo { slug: string; path: string; created: boolean }`
  - `registerRepo(absPath: string, gitRemote?: string): Promise<ResolvedRepo>` — idempotent by path; writes `_repo.md`.
  - `interface ResolveFeatureInput { slug?: string; title?: string; repos?: string[]; paths?: string[] }`
  - `interface ResolvedFeature { slug: string; title: string; repos: string[]; paths: string[]; status: string; created: boolean }`
  - `resolveFeature(input: ResolveFeatureInput): Promise<ResolvedFeature>` — create if missing, else merge `repos`/`paths`; writes `_feature.md`.
  - `getFeature(slug: string): Promise<ResolvedFeature | null>`

- [ ] **Step 1: Write the failing test**

Create `tests/feature-domain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault, readMarkdown } from "../src/vault/vault-io.js";
import { getPaths } from "../src/vault/vault-io.js";
import { discoverRepos, registerRepo, resolveFeature, getFeature } from "../src/domain/feature.js";
import type { RepoFrontmatter } from "../src/schemas/repo.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-feat-"));
  await initVault(dir);
}

async function fakeWorkspace() {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "oag-ws-root-"));
  for (const name of ["cozrum-server", "cozrum-cms"]) {
    await fs.mkdir(path.join(ws, name, ".git"), { recursive: true });
  }
  await fs.mkdir(path.join(ws, "not-a-repo"), { recursive: true });
  return ws;
}

test("discoverRepos finds only git roots", async () => {
  await freshVault();
  const ws = await fakeWorkspace();
  const repos = await discoverRepos(ws);
  assert.deepEqual(
    repos.map((r) => r.slug),
    ["cozrum-cms", "cozrum-server"],
  );
});

test("registerRepo is idempotent by path and writes _repo.md", async () => {
  await freshVault();
  const ws = await fakeWorkspace();
  const repoPath = path.join(ws, "cozrum-server");

  const first = await registerRepo(repoPath);
  assert.equal(first.slug, "cozrum-server");
  assert.equal(first.created, true);

  const again = await registerRepo(repoPath);
  assert.equal(again.created, false);

  const doc = await readMarkdown<RepoFrontmatter>(getPaths().repoFile("cozrum-server"));
  assert.equal(doc?.data.slug, "cozrum-server");
});

test("resolveFeature creates then merges repos/paths", async () => {
  await freshVault();
  const created = await resolveFeature({ title: "MISA Payout", repos: ["cozrum-server"] });
  assert.equal(created.slug, "misa-payout");
  assert.equal(created.created, true);
  assert.deepEqual(created.repos, ["cozrum-server"]);

  const merged = await resolveFeature({ slug: "misa-payout", repos: ["cozrum-cms"], paths: ["x/y"] });
  assert.equal(merged.created, false);
  assert.deepEqual(merged.repos, ["cozrum-server", "cozrum-cms"]);
  assert.deepEqual(merged.paths, ["x/y"]);

  const got = await getFeature("misa-payout");
  assert.equal(got?.title, "MISA Payout");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/feature-domain.test.js`
Expected: build error — `src/domain/feature.js` does not exist.

- [ ] **Step 3: Implement the domain module**

`src/domain/feature.ts`:

```ts
import path from "node:path";
import { promises as fs } from "node:fs";
import { getPaths, readMarkdown, writeMarkdown } from "../vault/vault-io.js";
import { fileExists } from "../vault/atomic-write.js";
import { slugify } from "../utils/slug.js";
import { nowIso } from "../utils/time.js";
import { RepoFrontmatter } from "../schemas/repo.js";
import { FeatureFrontmatter } from "../schemas/feature.js";
import {
  registerRepoEntry,
  lookupRepoByPath,
  upsertFeatureEntry,
  lookupFeatureBySlug,
  FeatureEntry,
  RepoEntry,
} from "../vault/workspace-registry.js";

export interface DiscoveredRepo {
  slug: string;
  path: string;
}

export async function discoverRepos(workspaceRoot: string): Promise<DiscoveredRepo[]> {
  const root = path.resolve(workspaceRoot);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const repos: DiscoveredRepo[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const repoPath = path.join(root, e.name);
    if (await fileExists(path.join(repoPath, ".git"))) {
      repos.push({ slug: slugify(e.name), path: repoPath });
    }
  }
  return repos.sort((a, b) => a.slug.localeCompare(b.slug));
}

export interface ResolvedRepo {
  slug: string;
  path: string;
  created: boolean;
}

export async function registerRepo(absPath: string, gitRemote?: string): Promise<ResolvedRepo> {
  const normalized = path.resolve(absPath);
  const existing = await lookupRepoByPath(normalized);
  if (existing) return { slug: existing.slug, path: existing.path, created: false };

  const slug = slugify(path.basename(normalized)) || "repo";
  const entry = await registerRepoEntry(slug, normalized, gitRemote);
  await writeRepoDoc(entry);
  return { slug: entry.slug, path: entry.path, created: true };
}

async function writeRepoDoc(entry: RepoEntry): Promise<void> {
  const now = nowIso();
  const fm: RepoFrontmatter = {
    slug: entry.slug,
    path: entry.path,
    git_remote: entry.git_remote,
    created_at: entry.registered_at,
    updated_at: now,
  };
  const body = [
    `# ${entry.slug}`,
    "",
    `- Path: \`${entry.path}\``,
    "",
    "## Run / Test",
    "",
    "_Fill in run_cmd / test_cmd in the frontmatter._",
    "",
    "## Architecture",
    "",
    "_Summary of this repo (entry chain, conventions, gotchas)._",
    "",
  ].join("\n");
  await writeMarkdown(getPaths().repoFile(entry.slug), fm as unknown as Record<string, unknown>, body);
}

export interface ResolveFeatureInput {
  slug?: string;
  title?: string;
  repos?: string[];
  paths?: string[];
}

export interface ResolvedFeature {
  slug: string;
  title: string;
  repos: string[];
  paths: string[];
  status: string;
  created: boolean;
}

function mergeUnique(base: string[], extra?: string[]): string[] {
  if (!extra || extra.length === 0) return base;
  const set = new Set(base);
  for (const item of extra) set.add(item);
  return Array.from(set);
}

function toResolved(entry: FeatureEntry, created: boolean): ResolvedFeature {
  return {
    slug: entry.slug,
    title: entry.title,
    repos: entry.repos,
    paths: entry.paths,
    status: entry.status,
    created,
  };
}

export async function resolveFeature(input: ResolveFeatureInput): Promise<ResolvedFeature> {
  const title = input.title ?? input.slug ?? "untitled";
  const slug = slugify(input.slug ?? title) || "feature";
  const now = nowIso();

  const existing = await lookupFeatureBySlug(slug);
  if (existing) {
    const merged: FeatureEntry = {
      ...existing,
      repos: mergeUnique(existing.repos, input.repos),
      paths: mergeUnique(existing.paths, input.paths),
      updated_at: now,
    };
    await upsertFeatureEntry(merged);
    await writeFeatureDoc(merged);
    return toResolved(merged, false);
  }

  const entry: FeatureEntry = {
    slug,
    title,
    repos: input.repos ?? [],
    paths: input.paths ?? [],
    status: "active",
    created_at: now,
    updated_at: now,
  };
  await upsertFeatureEntry(entry);
  await writeFeatureDoc(entry);
  return toResolved(entry, true);
}

export async function getFeature(slug: string): Promise<ResolvedFeature | null> {
  const entry = await lookupFeatureBySlug(slug);
  return entry ? toResolved(entry, false) : null;
}

async function writeFeatureDoc(entry: FeatureEntry): Promise<void> {
  const fm: FeatureFrontmatter = {
    slug: entry.slug,
    title: entry.title,
    repos: entry.repos,
    paths: entry.paths,
    status: entry.status as FeatureFrontmatter["status"],
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  };
  const reposList = entry.repos.length ? entry.repos.map((r) => `- \`${r}\``).join("\n") : "_None yet._";
  const body = [
    `# ${entry.title}`,
    "",
    "## Repos",
    "",
    reposList,
    "",
    "Working memory lives in `working/`, lessons in `lessons/`, plans in `plans/`.",
    "",
  ].join("\n");
  await writeMarkdown(getPaths().featureFile(entry.slug), fm as unknown as Record<string, unknown>, body);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/feature-domain.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/feature.ts tests/feature-domain.test.ts
git commit -m "feat: add feature/repo domain (discover, register, resolve)"
```

---

### Task 4: Initialize the new vault folders on boot

**Files:**
- Modify: `src/vault/vault-io.ts:11-27` (the `initVault` function)
- Test: `tests/init-vault.test.ts`

**Interfaces:**
- Consumes: `getPaths()` members from Task 1; `ensureDir`, `fileExists`, `writeAtomic` already imported in `vault-io.ts`.
- Produces: after `initVault(root)`, the directories `features/`, `repos/`, `global/playbooks/`, `global/instincts/` exist and `_index/workspace.json` exists containing `{"repos":{},"features":{}}`.

- [ ] **Step 1: Write the failing test**

Create `tests/init-vault.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/init-vault.test.js`
Expected: FAIL — `featuresDir`/`workspace.json` not created by `initVault` yet.

- [ ] **Step 3: Extend `initVault`**

In `src/vault/vault-io.ts`, inside `initVault`, after the existing `if (!(await fileExists(paths.indexFile))) { ... }` block and before the `.obsidian` marker block, insert:

```ts
  await ensureDir(paths.featuresDir);
  await ensureDir(paths.reposDir);
  await ensureDir(paths.playbooksDir);
  await ensureDir(paths.instinctsDir);
  if (!(await fileExists(paths.workspaceIndexFile))) {
    await writeAtomic(
      paths.workspaceIndexFile,
      JSON.stringify({ repos: {}, features: {} }, null, 2),
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tests/init-vault.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Run the whole suite + typecheck**

Run: `npm run build && node --test dist/tests/*.test.js && npm run typecheck`
Expected: all tests PASS, no type errors. (Existing project/plan/task code is untouched and still compiles.)

- [ ] **Step 6: Commit**

```bash
git add src/vault/vault-io.ts tests/init-vault.test.ts
git commit -m "feat: initialize feature/repo/global vault folders on boot"
```

---

## Self-Review

**Spec coverage (this plan = the §3 scope model + §5 vault layout substrate only):**
- §3 workspace/repo/feature scope keys → Tasks 2 & 3 (registry + domain). ✓
- §5 `features/`, `repos/`, `global/`, `_index/workspace.json` → Tasks 1 & 4. ✓
- §7 `_repo.md`, `_feature.md`, `workspace.json` shapes → Tasks 2 (schemas/registry) & 3 (docs). ✓
- Deferred to later plans (explicitly out of scope here): active-context pointer & `agent_boot` rewrite (§6, §8 → Plan 3), read/write protocol + tools (§9, §10 → Plan 3), `project → feature` swap of plan/task and tools + clean-slate removal of `project.ts` (§11 → Plan 2), instinct confidence/promotion/staleness (§9 → Plan 3).

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the `_repo.md`/`_feature.md` bodies intentionally contain author-facing `_..._` prompts inside generated markdown (content, not plan placeholders). ✓

**Type consistency:** `RepoEntry`/`FeatureEntry` (registry) vs `RepoFrontmatter`/`FeatureFrontmatter` (schemas) are distinct on purpose — registry uses `registered_at`; frontmatter uses `created_at`/`updated_at`. `resolveFeature`/`registerRepo` return `Resolved*` shapes consumed by Plan 2/3. `discoverRepos` returns `DiscoveredRepo` used by Plan 3's `agent_boot`. Names are consistent across tasks. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-agent-gateway-scope-foundation.md`. This is Plan 1 of 3 for the Memory layer (Plan 2: swap plan/task & tools to feature + clean-slate; Plan 3: memory tiers + startup bundle).

Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
