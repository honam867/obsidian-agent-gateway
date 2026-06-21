# Agent Gateway — Self-Learn Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two per-repo learning tiers (`project-lessons` and `playbook`) with confidence/reinforcement, a proactive repetition nudge, promotion of a recurring repo lesson to a global instinct, and recall of a repo's lessons+playbooks at session start — so the agent skips known errors and reuses known patterns.

**Architecture:** Additive on the existing memory tiers. `lesson.ts`/`playbook.ts` mirror `knowledge.ts` (per-repo storage) + `instinct.ts` (confidence reinforce). `recall.ts` is extended to also load repo lessons+playbooks. New MCP tools wrap them; `lesson_save` returns a proactive nudge in `next_actions` when `observations` crosses a configurable threshold. Existing code is untouched except `paths.ts`, `config.ts`, `recall.ts`, `tools/index.ts`.

**Tech Stack:** TypeScript (strict, ESM `NodeNext`), `gray-matter`, `write-file-atomic`, `zod`, `node:test`.

## Global Constraints

- Node `>=20`; TypeScript `strict`; `NodeNext` (import siblings with `.js`).
- Tests compiled to `dist/tests/` and run with `node --test`; always `npm run build` before a test.
- Code style uses `?.`/`??` freely. Frontmatter via `writeMarkdown(path,data,body)`; `readMarkdown<T>(path)` returns `null` if missing. Pass typed frontmatter as `x as unknown as Record<string, unknown>` (repo idiom). Never put `undefined` in frontmatter.
- Confidence reinforce (reused from `instinct.ts`): start `0.5`; re-save → `min(1, c + (1 - c) * 0.5)`; `created_at` preserved; `observations` +1.
- Scope: `lessons` and `playbooks` are PER-REPO under `repos/<repo>/`. `instinct` stays global.
- Save policy: `lesson_save` is auto (agent calls after a fix); `playbook_save` + `memory_promote` are ask-first (behavioral, enforced by the protocol, not the tool).
- Proactive threshold: `AGENT_GATEWAY_LEARN_THRESHOLD` (default `2`). The nudge is advisory `next_actions` only — never blocks.
- Every new tool returns the observation contract `{ status, summary, next_actions: string[], artifacts: string[], data? }`.

---

### Task 1: Paths + config threshold

**Files:**
- Modify: `src/vault/paths.ts`
- Modify: `src/config.ts`
- Test: `tests/paths-selflearn.test.ts`

**Interfaces:**
- Consumes: existing `reposDir` local in `makeVaultPaths`.
- Produces: `VaultPaths` gains `repoLessonsDir(repo)`, `repoLessonFile(repo, slug)`, `repoPlaybooksDir(repo)`, `repoPlaybookFile(repo, slug)`. `Config` gains optional `learnThreshold?: number` (default 2, from `AGENT_GATEWAY_LEARN_THRESHOLD`).

- [ ] **Step 1: Write the failing test**

Create `tests/paths-selflearn.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { makeVaultPaths } from "../src/vault/paths.js";
import { loadConfig } from "../src/config.js";

const root = path.resolve("/vault");
const p = makeVaultPaths("/vault");

test("lesson paths", () => {
  assert.equal(p.repoLessonsDir("cozrum-server"), path.join(root, "repos", "cozrum-server", "lessons"));
  assert.equal(
    p.repoLessonFile("cozrum-server", "cash-remap"),
    path.join(root, "repos", "cozrum-server", "lessons", "cash-remap.md"),
  );
});

test("playbook paths", () => {
  assert.equal(p.repoPlaybooksDir("cozrum-server"), path.join(root, "repos", "cozrum-server", "playbooks"));
  assert.equal(
    p.repoPlaybookFile("cozrum-server", "run-script"),
    path.join(root, "repos", "cozrum-server", "playbooks", "run-script.md"),
  );
});

test("config has a learn threshold defaulting to 2", () => {
  delete process.env.AGENT_GATEWAY_LEARN_THRESHOLD;
  assert.equal(loadConfig().learnThreshold, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/paths-selflearn.test.js`
Expected: build error / FAIL — new members/field missing.

- [ ] **Step 3: Add the path members**

In `src/vault/paths.ts`, add to the `VaultPaths` interface (after `instinctFile(slug: string): string;`):

```ts
  repoLessonsDir(repo: string): string;
  repoLessonFile(repo: string, slug: string): string;
  repoPlaybooksDir(repo: string): string;
  repoPlaybookFile(repo: string, slug: string): string;
```

In `makeVaultPaths`, add to the returned object (after `instinctFile: (slug) => ...`):

```ts
    repoLessonsDir: (repo) => path.join(reposDir, repo, "lessons"),
    repoLessonFile: (repo, slug) => path.join(reposDir, repo, "lessons", `${slug}.md`),
    repoPlaybooksDir: (repo) => path.join(reposDir, repo, "playbooks"),
    repoPlaybookFile: (repo, slug) => path.join(reposDir, repo, "playbooks", `${slug}.md`),
```

- [ ] **Step 4: Add the config field**

In `src/config.ts`, add to the `Config` interface (after `breakdown: { small: number; large: number; };`):

```ts
  learnThreshold?: number;
```

In `loadConfig`, before the `return`, add:

```ts
  const thresholdRaw = Number(process.env.AGENT_GATEWAY_LEARN_THRESHOLD ?? 2);
  const learnThreshold = Number.isInteger(thresholdRaw) && thresholdRaw > 0 ? thresholdRaw : 2;
```

and add `learnThreshold,` to the returned object.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && node --test dist/tests/paths-selflearn.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/vault/paths.ts src/config.ts tests/paths-selflearn.test.ts
git commit -m "feat: add lesson/playbook paths + learn threshold config"
```

---

### Task 2: Lesson domain (per-repo bug/incident with confidence)

**Files:**
- Create: `src/domain/lesson.ts`
- Test: `tests/lesson-domain.test.ts`

**Interfaces:**
- Consumes: `getPaths().repoLessonFile/repoLessonsDir` (Task 1); `readMarkdown`, `writeMarkdown`, `listFiles`; `nowIso`; `slugify`.
- Produces:
  - `interface LessonInput { repo; slug; symptom; cause; fix; sourcePaths?; tags? }` (strings; arrays optional).
  - `interface LessonFm { id; repo; status: "fixed"; symptom; cause; fix; confidence; observations; last_reinforced_at; created_at; source_paths: string[]; tags: string[] }`.
  - `interface LessonPointer { id; repo; confidence; observations; source_paths: string[] }`.
  - `saveLesson(input): Promise<LessonFm>` — upsert by repo+slug; re-save reinforces (confidence, observations+1, `created_at` preserved); stores symptom/cause/fix in frontmatter AND renders them in the body.
  - `getLesson(repo, slug): Promise<{ data: LessonFm; content: string } | null>`.
  - `listLessons(repo): Promise<LessonPointer[]>` — pointers, sorted by confidence desc then observations desc; `[]` for unknown repo.

- [ ] **Step 1: Write the failing test**

Create `tests/lesson-domain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { saveLesson, getLesson, listLessons } from "../src/domain/lesson.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-lesson-"));
  await initVault(dir);
}

test("saveLesson stores symptom/cause/fix and getLesson reads them back", async () => {
  await freshVault();
  const fm = await saveLesson({
    repo: "cozrum-server",
    slug: "cash-remap-null",
    symptom: "remap returns null account for cash",
    cause: "PAYOUT_CASH_SOURCES not matched",
    fix: "use resolveTargetForPayout cash branch",
    sourcePaths: ["src/.../index.js"],
  });
  assert.equal(fm.id, "cash-remap-null");
  assert.equal(fm.status, "fixed");
  assert.equal(fm.confidence, 0.5);
  assert.equal(fm.observations, 1);
  assert.equal(fm.cause, "PAYOUT_CASH_SOURCES not matched");

  const got = await getLesson("cozrum-server", "cash-remap-null");
  assert.match(got?.content ?? "", /resolveTargetForPayout/);
});

test("re-saving the same lesson reinforces (0.5 -> 0.75, obs 1 -> 2, created_at kept)", async () => {
  await freshVault();
  const first = await saveLesson({ repo: "r1", slug: "x", symptom: "s", cause: "c", fix: "f" });
  const second = await saveLesson({ repo: "r1", slug: "x", symptom: "s", cause: "c", fix: "f2" });
  assert.equal(second.observations, 2);
  assert.equal(second.confidence, 0.75);
  assert.equal(second.created_at, first.created_at);
  assert.equal(second.fix, "f2");
});

test("listLessons returns pointers sorted by confidence; [] for unknown repo", async () => {
  await freshVault();
  await saveLesson({ repo: "r2", slug: "low", symptom: "s", cause: "c", fix: "f" }); // 0.5
  await saveLesson({ repo: "r2", slug: "high", symptom: "s", cause: "c", fix: "f" });
  await saveLesson({ repo: "r2", slug: "high", symptom: "s", cause: "c", fix: "f" }); // 0.75
  const pointers = await listLessons("r2");
  assert.equal(pointers[0].id, "high");
  assert.deepEqual(await listLessons("nope"), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/lesson-domain.test.js`
Expected: build error — module missing.

- [ ] **Step 3: Implement the module**

`src/domain/lesson.ts`:

```ts
import { getPaths, readMarkdown, writeMarkdown, listFiles } from "../vault/vault-io.js";
import { nowIso } from "../utils/time.js";
import { slugify } from "../utils/slug.js";

export interface LessonInput {
  repo: string;
  slug: string;
  symptom: string;
  cause: string;
  fix: string;
  sourcePaths?: string[];
  tags?: string[];
}

export interface LessonFm {
  id: string;
  repo: string;
  status: "fixed";
  symptom: string;
  cause: string;
  fix: string;
  confidence: number;
  observations: number;
  last_reinforced_at: string;
  created_at: string;
  source_paths: string[];
  tags: string[];
}

export interface LessonPointer {
  id: string;
  repo: string;
  confidence: number;
  observations: number;
  source_paths: string[];
}

function reinforce(confidence: number): number {
  return Math.min(1, confidence + (1 - confidence) * 0.5);
}

export async function saveLesson(input: LessonInput): Promise<LessonFm> {
  const id = slugify(input.slug) || "lesson";
  const now = nowIso();
  const existing = await readMarkdown<LessonFm>(getPaths().repoLessonFile(input.repo, id));

  const fm: LessonFm = existing
    ? {
        ...existing.data,
        status: "fixed",
        symptom: input.symptom,
        cause: input.cause,
        fix: input.fix,
        confidence: reinforce(existing.data.confidence),
        observations: existing.data.observations + 1,
        last_reinforced_at: now,
        source_paths: input.sourcePaths ?? existing.data.source_paths ?? [],
        tags: input.tags ?? existing.data.tags ?? [],
      }
    : {
        id,
        repo: input.repo,
        status: "fixed",
        symptom: input.symptom,
        cause: input.cause,
        fix: input.fix,
        confidence: 0.5,
        observations: 1,
        last_reinforced_at: now,
        created_at: now,
        source_paths: input.sourcePaths ?? [],
        tags: input.tags ?? [],
      };

  const body = [
    `# ${input.slug}`,
    "",
    "## Symptom",
    "",
    input.symptom,
    "",
    "## Cause",
    "",
    input.cause,
    "",
    "## Fix",
    "",
    input.fix,
    "",
  ].join("\n");

  await writeMarkdown(
    getPaths().repoLessonFile(input.repo, id),
    fm as unknown as Record<string, unknown>,
    body,
  );
  return fm;
}

export async function getLesson(
  repo: string,
  slug: string,
): Promise<{ data: LessonFm; content: string } | null> {
  const id = slugify(slug) || "lesson";
  const parsed = await readMarkdown<LessonFm>(getPaths().repoLessonFile(repo, id));
  return parsed ? { data: parsed.data, content: parsed.content } : null;
}

export async function listLessons(repo: string): Promise<LessonPointer[]> {
  const files = await listFiles(getPaths().repoLessonsDir(repo), ".md");
  const out: LessonPointer[] = [];
  for (const file of files) {
    const id = file.replace(/\.md$/, "");
    const parsed = await readMarkdown<LessonFm>(getPaths().repoLessonFile(repo, id));
    if (!parsed) continue;
    out.push({
      id: parsed.data.id,
      repo: parsed.data.repo,
      confidence: parsed.data.confidence,
      observations: parsed.data.observations,
      source_paths: parsed.data.source_paths ?? [],
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence || b.observations - a.observations);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/lesson-domain.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/lesson.ts tests/lesson-domain.test.ts
git commit -m "feat: add per-repo lesson domain (bug/incident with confidence)"
```

---

### Task 3: Playbook domain (per-repo reusable procedure with confidence)

**Files:**
- Create: `src/domain/playbook.ts`
- Test: `tests/playbook-domain.test.ts`

**Interfaces:**
- Consumes: `getPaths().repoPlaybookFile/repoPlaybooksDir` (Task 1); `readMarkdown`, `writeMarkdown`, `listFiles`; `nowIso`; `slugify`.
- Produces:
  - `interface PlaybookInput { repo; slug; title; steps; tags? }`.
  - `interface PlaybookFm { id; repo; title; confidence; observations; last_reinforced_at; created_at; tags: string[] }`.
  - `interface PlaybookPointer { id; repo; title; confidence }`.
  - `savePlaybook(input): Promise<PlaybookFm>` — upsert by repo+slug; re-save reinforces; body = title + `## Steps`.
  - `getPlaybook(repo, slug): Promise<{ data: PlaybookFm; content: string } | null>`.
  - `listPlaybooks(repo): Promise<PlaybookPointer[]>` — sorted by confidence desc; `[]` for unknown repo.

- [ ] **Step 1: Write the failing test**

Create `tests/playbook-domain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { savePlaybook, getPlaybook, listPlaybooks } from "../src/domain/playbook.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-playbook-"));
  await initVault(dir);
}

test("savePlaybook stores title+steps; getPlaybook reads them; first save confidence 0.5", async () => {
  await freshVault();
  const fm = await savePlaybook({
    repo: "cozrum-server",
    slug: "run-script-safely",
    title: "Run a cozrum-server script safely",
    steps: "1. check-db-port.js\n2. run the script with forward slashes",
  });
  assert.equal(fm.id, "run-script-safely");
  assert.equal(fm.confidence, 0.5);
  assert.equal(fm.observations, 1);
  const got = await getPlaybook("cozrum-server", "run-script-safely");
  assert.match(got?.content ?? "", /check-db-port/);
});

test("re-saving reinforces (0.5 -> 0.75, obs 2, created_at kept)", async () => {
  await freshVault();
  const first = await savePlaybook({ repo: "r1", slug: "p", title: "P", steps: "a" });
  const second = await savePlaybook({ repo: "r1", slug: "p", title: "P", steps: "b" });
  assert.equal(second.observations, 2);
  assert.equal(second.confidence, 0.75);
  assert.equal(second.created_at, first.created_at);
});

test("listPlaybooks sorts by confidence; [] for unknown repo", async () => {
  await freshVault();
  await savePlaybook({ repo: "r2", slug: "low", title: "L", steps: "x" });
  await savePlaybook({ repo: "r2", slug: "high", title: "H", steps: "x" });
  await savePlaybook({ repo: "r2", slug: "high", title: "H", steps: "x" });
  const pointers = await listPlaybooks("r2");
  assert.equal(pointers[0].id, "high");
  assert.deepEqual(await listPlaybooks("nope"), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/playbook-domain.test.js`
Expected: build error — module missing.

- [ ] **Step 3: Implement the module**

`src/domain/playbook.ts`:

```ts
import { getPaths, readMarkdown, writeMarkdown, listFiles } from "../vault/vault-io.js";
import { nowIso } from "../utils/time.js";
import { slugify } from "../utils/slug.js";

export interface PlaybookInput {
  repo: string;
  slug: string;
  title: string;
  steps: string;
  tags?: string[];
}

export interface PlaybookFm {
  id: string;
  repo: string;
  title: string;
  confidence: number;
  observations: number;
  last_reinforced_at: string;
  created_at: string;
  tags: string[];
}

export interface PlaybookPointer {
  id: string;
  repo: string;
  title: string;
  confidence: number;
}

function reinforce(confidence: number): number {
  return Math.min(1, confidence + (1 - confidence) * 0.5);
}

export async function savePlaybook(input: PlaybookInput): Promise<PlaybookFm> {
  const id = slugify(input.slug) || "playbook";
  const now = nowIso();
  const existing = await readMarkdown<PlaybookFm>(getPaths().repoPlaybookFile(input.repo, id));

  const fm: PlaybookFm = existing
    ? {
        ...existing.data,
        title: input.title,
        confidence: reinforce(existing.data.confidence),
        observations: existing.data.observations + 1,
        last_reinforced_at: now,
        tags: input.tags ?? existing.data.tags ?? [],
      }
    : {
        id,
        repo: input.repo,
        title: input.title,
        confidence: 0.5,
        observations: 1,
        last_reinforced_at: now,
        created_at: now,
        tags: input.tags ?? [],
      };

  const body = [`# ${input.title}`, "", "## Steps", "", input.steps, ""].join("\n");
  await writeMarkdown(
    getPaths().repoPlaybookFile(input.repo, id),
    fm as unknown as Record<string, unknown>,
    body,
  );
  return fm;
}

export async function getPlaybook(
  repo: string,
  slug: string,
): Promise<{ data: PlaybookFm; content: string } | null> {
  const id = slugify(slug) || "playbook";
  const parsed = await readMarkdown<PlaybookFm>(getPaths().repoPlaybookFile(repo, id));
  return parsed ? { data: parsed.data, content: parsed.content } : null;
}

export async function listPlaybooks(repo: string): Promise<PlaybookPointer[]> {
  const files = await listFiles(getPaths().repoPlaybooksDir(repo), ".md");
  const out: PlaybookPointer[] = [];
  for (const file of files) {
    const id = file.replace(/\.md$/, "");
    const parsed = await readMarkdown<PlaybookFm>(getPaths().repoPlaybookFile(repo, id));
    if (!parsed) continue;
    out.push({
      id: parsed.data.id,
      repo: parsed.data.repo,
      title: parsed.data.title,
      confidence: parsed.data.confidence,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/playbook-domain.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/playbook.ts tests/playbook-domain.test.ts
git commit -m "feat: add per-repo playbook domain (reusable procedure with confidence)"
```

---

### Task 4: Promote a repo lesson to a global instinct

**Files:**
- Create: `src/domain/promote.ts`
- Test: `tests/promote-domain.test.ts`

**Interfaces:**
- Consumes: `getLesson` (Task 2); `saveInstinct`, `InstinctFm` (`domain/instinct.js`).
- Produces: `promoteLessonToInstinct(repo: string, lessonSlug: string): Promise<InstinctFm | null>` — reads the lesson; if missing returns `null`; else creates/reinforces a global instinct with `slug = "${repo}-${lessonSlug}"`, `title = "[${repo}] ${lessonSlug}"`, `trigger = lesson.symptom`, `action = lesson.fix`, `why = lesson.cause`.

- [ ] **Step 1: Write the failing test**

Create `tests/promote-domain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { saveLesson } from "../src/domain/lesson.js";
import { listTopInstincts } from "../src/domain/instinct.js";
import { promoteLessonToInstinct } from "../src/domain/promote.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-promote-"));
  await initVault(dir);
}

test("promote turns a repo lesson into a global instinct", async () => {
  await freshVault();
  await saveLesson({ repo: "cozrum-server", slug: "cash", symptom: "S", cause: "C", fix: "F" });
  const instinct = await promoteLessonToInstinct("cozrum-server", "cash");
  assert.equal(instinct?.id, "cozrum-server-cash");
  const top = await listTopInstincts(5);
  assert.ok(top.some((i) => i.id === "cozrum-server-cash"));
});

test("promote returns null for a missing lesson", async () => {
  await freshVault();
  assert.equal(await promoteLessonToInstinct("r", "ghost"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/promote-domain.test.js`
Expected: build error — module missing.

- [ ] **Step 3: Implement the module**

`src/domain/promote.ts`:

```ts
import { getLesson } from "./lesson.js";
import { saveInstinct, InstinctFm } from "./instinct.js";

export async function promoteLessonToInstinct(
  repo: string,
  lessonSlug: string,
): Promise<InstinctFm | null> {
  const lesson = await getLesson(repo, lessonSlug);
  if (!lesson) return null;
  return saveInstinct({
    slug: `${repo}-${lesson.data.id}`,
    title: `[${repo}] ${lesson.data.id}`,
    trigger: lesson.data.symptom,
    action: lesson.data.fix,
    why: lesson.data.cause,
    tags: lesson.data.tags,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/promote-domain.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/promote.ts tests/promote-domain.test.ts
git commit -m "feat: promote a repo lesson into a global instinct"
```

---

### Task 5: Recall integration (load repo lessons + playbooks)

**Files:**
- Modify: `src/domain/recall.ts`
- Test: `tests/recall-selflearn.test.ts`

**Interfaces:**
- Consumes: `listLessons`, `LessonPointer` (Task 2); `listPlaybooks`, `PlaybookPointer` (Task 3).
- Produces: `RecallBundle` gains `lessons: LessonPointer[]` and `playbooks: PlaybookPointer[]`. `recall()` loads them for every repo in the resolved feature's `repos` (empty when no feature).

- [ ] **Step 1: Write the failing test**

Create `tests/recall-selflearn.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import { resolveFeature } from "../src/domain/feature.js";
import { saveLesson } from "../src/domain/lesson.js";
import { savePlaybook } from "../src/domain/playbook.js";
import { recall } from "../src/domain/recall.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-recall-sl-"));
  await initVault(dir);
}

test("recall includes the feature's repo lessons and playbooks", async () => {
  await freshVault();
  await resolveFeature({ slug: "misa-payout", title: "MISA Payout", repos: ["cozrum-server"] });
  await saveLesson({ repo: "cozrum-server", slug: "cash", symptom: "s", cause: "c", fix: "f" });
  await savePlaybook({ repo: "cozrum-server", slug: "run", title: "Run", steps: "x" });

  const bundle = await recall("misa-payout");
  assert.deepEqual(bundle.lessons.map((l) => l.id), ["cash"]);
  assert.deepEqual(bundle.playbooks.map((p) => p.id), ["run"]);
});

test("recall on unknown feature returns empty lessons/playbooks", async () => {
  await freshVault();
  const bundle = await recall("nope");
  assert.deepEqual(bundle.lessons, []);
  assert.deepEqual(bundle.playbooks, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/recall-selflearn.test.js`
Expected: FAIL — `bundle.lessons` is `undefined`.

- [ ] **Step 3: Extend `recall.ts`**

Replace the entire contents of `src/domain/recall.ts` with:

```ts
import { getFeature, ResolvedFeature } from "./feature.js";
import { readProgress, Progress } from "./working.js";
import { listKnowledge, KnowledgePointer } from "./knowledge.js";
import { listTopInstincts, InstinctFm } from "./instinct.js";
import { listLessons, LessonPointer } from "./lesson.js";
import { listPlaybooks, PlaybookPointer } from "./playbook.js";
import { slugify } from "../utils/slug.js";

export interface RecallBundle {
  feature: ResolvedFeature | null;
  progress: Progress | null;
  knowledge: KnowledgePointer[];
  lessons: LessonPointer[];
  playbooks: PlaybookPointer[];
  instincts: InstinctFm[];
}

export async function recall(
  feature: string,
  opts?: { instinctLimit?: number },
): Promise<RecallBundle> {
  const slug = slugify(feature) || "feature";
  const resolved = await getFeature(slug);
  const progress = resolved ? await readProgress(slug) : null;

  const knowledge: KnowledgePointer[] = [];
  const lessons: LessonPointer[] = [];
  const playbooks: PlaybookPointer[] = [];
  if (resolved) {
    for (const repo of resolved.repos) {
      for (const k of await listKnowledge(repo)) knowledge.push(k);
      for (const l of await listLessons(repo)) lessons.push(l);
      for (const p of await listPlaybooks(repo)) playbooks.push(p);
    }
  }

  const instincts = await listTopInstincts(opts?.instinctLimit ?? 5);

  return { feature: resolved, progress, knowledge, lessons, playbooks, instincts };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/recall-selflearn.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the recall + agent-recall suites (regression — they consume RecallBundle)**

Run: `npm run build && node --test dist/tests/recall-domain.test.js dist/tests/agent-recall-domain.test.js dist/tests/agent-recall-tool.test.js dist/tests/memory-tools.test.js`
Expected: all PASS (adding fields to RecallBundle is backward-compatible).

- [ ] **Step 6: Commit**

```bash
git add src/domain/recall.ts tests/recall-selflearn.test.ts
git commit -m "feat: recall loads repo lessons + playbooks"
```

---

### Task 6: `lesson_save` + `lesson_get` tools (with proactive nudge)

**Files:**
- Create: `src/tools/lesson-save.ts`
- Create: `src/tools/lesson-get.ts`
- Modify: `src/tools/index.ts`
- Test: `tests/lesson-tools.test.ts`

**Interfaces:**
- Consumes: `ToolContext`, `ToolDef` (`tools/types.js`); `saveLesson` (Task 2); `getLesson` (Task 2); `ctx.config.learnThreshold` (Task 1); `registerTools` for the test.
- Produces: `lessonSaveTool(ctx)` (name `lesson_save`) + `lessonGetTool(ctx)` (name `lesson_get`), registered after `agentRecallTool(ctx),`. `lesson_save` returns a nudge in `next_actions` when `data.lesson.observations >= (ctx.config.learnThreshold ?? 2)`.

- [ ] **Step 1: Write the failing test**

Create `tests/lesson-tools.test.ts`:

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/lesson-tools.test.js`
Expected: build error — modules / registrations missing.

- [ ] **Step 3: Create `src/tools/lesson-save.ts`**

```ts
import { z } from "zod";
import { saveLesson } from "../domain/lesson.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  repo: z.string().min(1),
  slug: z.string().min(1),
  symptom: z.string().min(1),
  cause: z.string().min(1),
  fix: z.string().min(1),
  source_paths: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export function lessonSaveTool(ctx: ToolContext): ToolDef {
  return {
    name: "lesson_save",
    description:
      "Save a per-repo lesson after you fix a bug/incident (symptom -> cause -> fix). AUTO: call it whenever you solve a repo-specific problem worth not re-discovering. Re-saving the same slug reinforces it; once it recurs, the response will suggest capturing a reusable playbook or promoting it.",
    annotations: { title: "Lesson Save", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo slug, e.g. 'cozrum-server'." },
        slug: { type: "string", description: "Stable id for this lesson, e.g. 'cash-remap-null'." },
        symptom: { type: "string", description: "What went wrong (the observable problem)." },
        cause: { type: "string", description: "Root cause." },
        fix: { type: "string", description: "How it was fixed (so next time you skip the discovery)." },
        source_paths: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["repo", "slug", "symptom", "cause", "fix"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide repo, slug, symptom, cause, fix."], artifacts: [] };
      }
      const input = parsed.data;
      const lesson = await saveLesson({
        repo: input.repo,
        slug: input.slug,
        symptom: input.symptom,
        cause: input.cause,
        fix: input.fix,
        sourcePaths: input.source_paths,
        tags: input.tags,
      });
      const threshold = ctx.config.learnThreshold ?? 2;
      const next_actions = ["Loaded automatically next session via agent_recall"];
      if (lesson.observations >= threshold) {
        next_actions.unshift(
          `This lesson recurred ${lesson.observations}×. Ask the user whether to capture it as a reusable playbook (playbook_save) or promote it to a global instinct (memory_promote).`,
        );
      }
      return {
        status: "success",
        summary: `Lesson saved: ${input.repo}/${lesson.id} (obs ${lesson.observations}, conf ${lesson.confidence})`,
        next_actions,
        artifacts: [`repos/${input.repo}/lessons/${lesson.id}.md`],
        data: { lesson },
      };
    },
  };
}
```

- [ ] **Step 4: Create `src/tools/lesson-get.ts`**

```ts
import { z } from "zod";
import { getLesson } from "../domain/lesson.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({ repo: z.string().min(1), slug: z.string().min(1) });

export function lessonGetTool(_ctx: ToolContext): ToolDef {
  return {
    name: "lesson_get",
    description:
      "Read the full text of a per-repo lesson (symptom/cause/fix) by repo + slug. Use when a recall pointer signals a relevant past bug and you need the fix details.",
    annotations: { title: "Lesson Get", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo slug." },
        slug: { type: "string", description: "Lesson id." },
      },
      required: ["repo", "slug"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide repo and slug."], artifacts: [] };
      }
      const lesson = await getLesson(parsed.data.repo, parsed.data.slug);
      if (!lesson) {
        return { status: "warning", summary: `No lesson ${parsed.data.repo}/${parsed.data.slug}`, next_actions: ["Check the slug or list via agent_recall."], artifacts: [] };
      }
      return {
        status: "success",
        summary: `Lesson ${parsed.data.repo}/${lesson.data.id}`,
        next_actions: ["Apply the fix; if it recurs, lesson_save reinforces it."],
        artifacts: [`repos/${parsed.data.repo}/lessons/${lesson.data.id}.md`],
        data: { frontmatter: lesson.data, content: lesson.content },
      };
    },
  };
}
```

- [ ] **Step 5: Register both tools in `src/tools/index.ts`**

Add imports after the existing tool imports:

```ts
import { lessonSaveTool } from "./lesson-save.js";
import { lessonGetTool } from "./lesson-get.js";
```

Add to the `registerTools` return array (after `agentRecallTool(ctx),`):

```ts
    lessonSaveTool(ctx),
    lessonGetTool(ctx),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/lesson-tools.test.js`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/tools/lesson-save.ts src/tools/lesson-get.ts src/tools/index.ts tests/lesson-tools.test.ts
git commit -m "feat: add lesson_save (with proactive nudge) + lesson_get tools"
```

---

### Task 7: `playbook_save` + `playbook_get` + `memory_promote` tools

**Files:**
- Create: `src/tools/playbook-save.ts`
- Create: `src/tools/playbook-get.ts`
- Create: `src/tools/memory-promote.ts`
- Modify: `src/tools/index.ts`
- Test: `tests/playbook-promote-tools.test.ts`

**Interfaces:**
- Consumes: `ToolContext`, `ToolDef`; `savePlaybook`, `getPlaybook` (Task 3); `promoteLessonToInstinct` (Task 4); `saveLesson` (Task 2, for the test); `registerTools` for the test.
- Produces: `playbookSaveTool(ctx)` (`playbook_save`), `playbookGetTool(ctx)` (`playbook_get`), `memoryPromoteTool(ctx)` (`memory_promote`), registered after `lessonGetTool(ctx),`.

- [ ] **Step 1: Write the failing test**

Create `tests/playbook-promote-tools.test.ts`:

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
  learnThreshold: 2,
};

function toolMap() {
  return new Map(registerTools({ config: cfg }).map((t) => [t.name, t]));
}

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-pbtool-"));
  await initVault(dir);
}

test("playbook_save, playbook_get, memory_promote are registered", () => {
  const tools = toolMap();
  assert.ok(tools.get("playbook_save"));
  assert.ok(tools.get("playbook_get"));
  assert.ok(tools.get("memory_promote"));
});

test("playbook_save writes and playbook_get reads it", async () => {
  await freshVault();
  const tools = toolMap();
  const saved = (await tools.get("playbook_save")!.handler({
    repo: "cozrum-server",
    slug: "run-script",
    title: "Run script safely",
    steps: "1. check-db-port\n2. run",
  })) as any;
  assert.equal(saved.status, "success");
  const got = (await tools.get("playbook_get")!.handler({ repo: "cozrum-server", slug: "run-script" })) as any;
  assert.equal(got.status, "success");
  assert.match(got.data.content, /check-db-port/);
});

test("memory_promote turns a lesson into a global instinct; warning when missing", async () => {
  await freshVault();
  const tools = toolMap();
  await tools.get("lesson_save")!.handler({ repo: "r", slug: "x", symptom: "s", cause: "c", fix: "f" });
  const ok = (await tools.get("memory_promote")!.handler({ repo: "r", lesson_slug: "x" })) as any;
  assert.equal(ok.status, "success");
  assert.equal(ok.data.instinct.id, "r-x");
  const miss = (await tools.get("memory_promote")!.handler({ repo: "r", lesson_slug: "ghost" })) as any;
  assert.equal(miss.status, "warning");
});

test("playbook_save rejects missing fields", async () => {
  await freshVault();
  const res = (await toolMap().get("playbook_save")!.handler({ repo: "r", slug: "x" })) as any;
  assert.equal(res.status, "error");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/playbook-promote-tools.test.js`
Expected: build error — modules / registrations missing.

- [ ] **Step 3: Create `src/tools/playbook-save.ts`**

```ts
import { z } from "zod";
import { savePlaybook } from "../domain/playbook.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  repo: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  steps: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export function playbookSaveTool(_ctx: ToolContext): ToolDef {
  return {
    name: "playbook_save",
    description:
      "Save a per-repo reusable procedure/pattern/business-rule so it can be repeated exactly next time. ASK THE USER FIRST (this captures a 'do it the same way' commitment) — typically after a lesson recurs or the user says a method is reusable. Re-saving the same slug reinforces it.",
    annotations: { title: "Playbook Save", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo slug." },
        slug: { type: "string", description: "Stable id, e.g. 'run-script-safely'." },
        title: { type: "string", description: "Short title." },
        steps: { type: "string", description: "The procedure, in markdown (ordered steps)." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["repo", "slug", "title", "steps"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide repo, slug, title, steps."], artifacts: [] };
      }
      const input = parsed.data;
      const playbook = await savePlaybook(input);
      return {
        status: "success",
        summary: `Playbook saved: ${input.repo}/${playbook.id} (conf ${playbook.confidence})`,
        next_actions: ["Loaded next session via agent_recall so it can be reused verbatim"],
        artifacts: [`repos/${input.repo}/playbooks/${playbook.id}.md`],
        data: { playbook },
      };
    },
  };
}
```

- [ ] **Step 4: Create `src/tools/playbook-get.ts`**

```ts
import { z } from "zod";
import { getPlaybook } from "../domain/playbook.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({ repo: z.string().min(1), slug: z.string().min(1) });

export function playbookGetTool(_ctx: ToolContext): ToolDef {
  return {
    name: "playbook_get",
    description:
      "Read the full steps of a per-repo playbook by repo + slug. Use when a recall pointer shows a relevant reusable procedure and you want to follow it exactly.",
    annotations: { title: "Playbook Get", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo slug." },
        slug: { type: "string", description: "Playbook id." },
      },
      required: ["repo", "slug"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide repo and slug."], artifacts: [] };
      }
      const playbook = await getPlaybook(parsed.data.repo, parsed.data.slug);
      if (!playbook) {
        return { status: "warning", summary: `No playbook ${parsed.data.repo}/${parsed.data.slug}`, next_actions: ["Check the slug."], artifacts: [] };
      }
      return {
        status: "success",
        summary: `Playbook ${parsed.data.repo}/${playbook.data.id}`,
        next_actions: ["Follow the steps; re-save (playbook_save) to reinforce after using it."],
        artifacts: [`repos/${parsed.data.repo}/playbooks/${playbook.data.id}.md`],
        data: { frontmatter: playbook.data, content: playbook.content },
      };
    },
  };
}
```

- [ ] **Step 5: Create `src/tools/memory-promote.ts`**

```ts
import { z } from "zod";
import { promoteLessonToInstinct } from "../domain/promote.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({ repo: z.string().min(1), lesson_slug: z.string().min(1) });

export function memoryPromoteTool(_ctx: ToolContext): ToolDef {
  return {
    name: "memory_promote",
    description:
      "Promote a recurring per-repo lesson into a GLOBAL instinct (applies across all repos). ASK THE USER FIRST. Use when the same lesson keeps applying beyond its repo — the lesson's symptom/cause/fix become an instinct trigger/why/action.",
    annotations: { title: "Memory Promote", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo slug the lesson belongs to." },
        lesson_slug: { type: "string", description: "The lesson id to promote." },
      },
      required: ["repo", "lesson_slug"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide repo and lesson_slug."], artifacts: [] };
      }
      const instinct = await promoteLessonToInstinct(parsed.data.repo, parsed.data.lesson_slug);
      if (!instinct) {
        return { status: "warning", summary: `No lesson ${parsed.data.repo}/${parsed.data.lesson_slug} to promote`, next_actions: ["Check the lesson slug."], artifacts: [] };
      }
      return {
        status: "success",
        summary: `Promoted to global instinct '${instinct.id}' (conf ${instinct.confidence})`,
        next_actions: ["Loaded for every project via agent_recall top instincts"],
        artifacts: [`global/instincts/${instinct.id}.md`],
        data: { instinct },
      };
    },
  };
}
```

- [ ] **Step 6: Register the three tools in `src/tools/index.ts`**

Add imports after the Task 6 imports:

```ts
import { playbookSaveTool } from "./playbook-save.js";
import { playbookGetTool } from "./playbook-get.js";
import { memoryPromoteTool } from "./memory-promote.js";
```

Add to the `registerTools` return array (after `lessonGetTool(ctx),`):

```ts
    playbookSaveTool(ctx),
    playbookGetTool(ctx),
    memoryPromoteTool(ctx),
```

- [ ] **Step 7: Run the new test + whole suite + typecheck**

Run: `npm run build && node --test dist/tests/playbook-promote-tools.test.js`
Expected: PASS (4 tests).

Then: `npm run build && node --test dist/tests/*.test.js && npm run typecheck`
Expected: ALL tests pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/tools/playbook-save.ts src/tools/playbook-get.ts src/tools/memory-promote.ts src/tools/index.ts tests/playbook-promote-tools.test.ts
git commit -m "feat: add playbook_save/get + memory_promote tools"
```

---

### Task 8: Self-learn section in `memory-protocol.md`

**Files:**
- Modify: `memory-protocol.md` (repo root)

**Interfaces:** none (documentation; the cross-CLI instruction source).

- [ ] **Step 1: Append the SELF-LEARN section**

Append to `memory-protocol.md` (after the existing `## DO NOT` section, before "The test for saving"):

````markdown
## SELF-LEARN — per-repo lessons & playbooks (auto + proactive)
- After you FIX a repo-specific bug/incident → `lesson_save(repo, slug, symptom, cause, fix)` (AUTO, no need to ask).
- When `lesson_save` (or your own judgement) signals a pattern recurred, OR the user mentions a method/
  pattern is reusable → ASK the user, then `playbook_save(repo, slug, title, steps)` so it can be repeated
  exactly next time without re-describing it.
- When a repo lesson clearly applies across repos → ASK the user, then `memory_promote(repo, lesson_slug)`
  to make it a global instinct.
- At session start, READ the lessons + playbooks that `agent_recall` loaded for the repo, and APPLY them —
  skip a known error straight to its fix, and follow a known playbook — before re-discovering anything.
````

- [ ] **Step 2: Verify**

Run: `node -e "const s=require('fs').readFileSync('memory-protocol.md','utf8');if(!/SELF-LEARN/.test(s)||!/lesson_save/.test(s)||!/playbook_save/.test(s)||!/memory_promote/.test(s))process.exit(1);console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add memory-protocol.md
git commit -m "docs: add self-learn protocol (lessons/playbooks/promote)"
```

---

## Self-Review

**Spec coverage:**
- §4 tiers `project-lessons` (per-repo) + `playbook` (per-repo) → Tasks 2, 3. ✓
- §6 data shapes (symptom/cause/fix in lesson; title/steps in playbook; confidence/observations) → Tasks 2, 3. ✓
- §7 tools `lesson_save`/`playbook_save`/`memory_promote` + get → Tasks 6, 7. (`lesson_list`/`playbook_list` from §7 are intentionally NOT separate tools — `agent_recall`/`recall` already return the lists; YAGNI.) ✓
- §8 proactive nudge (server counts observations; nudge in `next_actions` at threshold) → Task 6. ✓
- §8 configurable threshold → Task 1. ✓
- §9 recall loads repo lessons + playbooks → Task 5. ✓
- §10 protocol additions → Task 8. (The mirrored `~/.claude/CLAUDE.md` self-learn block is an interactive post-merge step, like the auto-recall install — not a subagent task, since it edits the user's global env.) ✓
- §3 save policy (auto lesson; ask playbook/promote) → encoded in tool DESCRIPTIONS + protocol (not enforced in code). ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. `uses` field from the spec's playbook was dropped (YAGNI — the spec's own open question defers its auto-increment; nothing would set it).

**Type consistency:** `LessonFm`/`LessonPointer`/`LessonInput` (Task 2), `PlaybookFm`/`PlaybookPointer`/`PlaybookInput` (Task 3) are consumed by Tasks 4, 5, 6, 7 with matching names. `recall` (Task 5) returns the extended `RecallBundle` consumed by existing recall/agent-recall tests (regression-checked in Task 5 Step 5). `ctx.config.learnThreshold` (Task 1, optional) consumed in Task 6 with `?? 2`. Reinforce math `0.5 → 0.75` consistent across lesson/playbook/instinct. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-agent-gateway-self-learn-engine.md`. The mirrored `~/.claude/CLAUDE.md` self-learn block + OpenCode/Codex install are interactive post-merge steps.

Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
