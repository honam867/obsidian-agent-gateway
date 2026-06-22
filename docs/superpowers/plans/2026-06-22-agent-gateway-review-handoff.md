# Agent Gateway — Review Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-feature review record (spec/plan) with two states (`reviewing` → `approved`) and overwrite-only feedback, plus MCP tools so two CLIs can hand off review through the shared vault without copy-pasting paths or feedback.

**Architecture:** Additive on the memory layer. A `review.ts` domain stores one markdown record per `feature + kind + slug` under `features/<feature>/reviews/`, mirroring the per-repo `knowledge.ts` storage style. New MCP tools wrap it. Overwrite semantics (no history/thread). Existing code is untouched except `paths.ts` and `tools/index.ts`.

**Tech Stack:** TypeScript (strict, ESM `NodeNext`), `gray-matter`, `write-file-atomic`, `zod`, `node:test`.

## Global Constraints

- Node `>=20`; TypeScript `strict`; `NodeNext` (import siblings with `.js`).
- Tests compiled to `dist/tests/` and run with `node --test`; always `npm run build` before a test. Cycle: `npm run build && node --test dist/tests/<file>.test.js`.
- Code style uses `?.`/`??` freely. Frontmatter via `writeMarkdown(path,data,body)`; `readMarkdown<T>(path)` returns `null` if missing. Pass typed frontmatter as `x as unknown as Record<string, unknown>`. Never put `undefined` in frontmatter.
- `slug` for a review derives from the document path's basename via `slugify(basename without extension)`.
- States are exactly `reviewing` (on open) and `approved` (on approve). Overwrite semantics: `review_open` and `review_note` REPLACE fields — no append, no history.
- Storage: `features/<feature>/reviews/<kind>-<slug>.md`; `kind` ∈ `spec | plan`.
- Every new tool returns the observation contract `{ status, summary, next_actions: string[], artifacts: string[], data? }`.
- ADDITIVE ONLY: existing code only gains `paths.ts` members + `tools/index.ts` registrations.

---

### Task 1: Review vault paths

**Files:**
- Modify: `src/vault/paths.ts`
- Test: `tests/paths-review.test.ts`

**Interfaces:**
- Consumes: the existing `featuresDir` local in `makeVaultPaths`.
- Produces: `VaultPaths` gains `featureReviewsDir(feature: string): string` and
  `featureReviewFile(feature: string, kind: string, slug: string): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/paths-review.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { makeVaultPaths } from "../src/vault/paths.js";

const root = path.resolve("/vault");
const p = makeVaultPaths("/vault");

test("review paths", () => {
  assert.equal(p.featureReviewsDir("misa-payout"), path.join(root, "features", "misa-payout", "reviews"));
  assert.equal(
    p.featureReviewFile("misa-payout", "spec", "oauth-login"),
    path.join(root, "features", "misa-payout", "reviews", "spec-oauth-login.md"),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/paths-review.test.js`
Expected: FAIL — members undefined.

- [ ] **Step 3: Add the path members**

In `src/vault/paths.ts`, add to the `VaultPaths` interface (after `repoPlaybookFile(repo: string, slug: string): string;`):

```ts
  featureReviewsDir(feature: string): string;
  featureReviewFile(feature: string, kind: string, slug: string): string;
```

In `makeVaultPaths`, add to the returned object (after `repoPlaybookFile: ...`):

```ts
    featureReviewsDir: (feature) => path.join(featuresDir, feature, "reviews"),
    featureReviewFile: (feature, kind, slug) =>
      path.join(featuresDir, feature, "reviews", `${kind}-${slug}.md`),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tests/paths-review.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/vault/paths.ts tests/paths-review.test.ts
git commit -m "feat: add feature review vault paths"
```

---

### Task 2: Review domain

**Files:**
- Create: `src/domain/review.ts`
- Test: `tests/review-domain.test.ts`

**Interfaces:**
- Consumes: `getPaths().featureReviewFile/featureReviewsDir`, `featuresDir` (Task 1 / earlier); `readMarkdown`, `writeMarkdown`, `listFiles`, `listDirs` from `vault/vault-io.js`; `slugify` from `utils/slug.js`; `nowIso` from `utils/time.js`; `node:path` `basename`.
- Produces:
  - `type ReviewKind = "spec" | "plan"`; `type ReviewState = "reviewing" | "approved"`.
  - `interface ReviewFm { kind: ReviewKind; slug: string; feature: string; path: string; state: ReviewState; updated_at: string }`.
  - `interface ReviewPointer { feature: string; kind: ReviewKind; slug: string; path: string; state: ReviewState }`.
  - `slugForPath(docPath: string): string` — `slugify(basename without extension)`.
  - `openReview(input: { feature: string; kind: ReviewKind; path: string }): Promise<ReviewFm>` — upsert/**overwrite** the record → `state: reviewing`, feedback reset to a placeholder.
  - `setReviewFeedback(feature: string, kind: ReviewKind, slug: string, feedback: string): Promise<ReviewFm | null>` — **overwrite** feedback body, keep `state: reviewing`; `null` if the record is missing.
  - `approveReview(feature: string, kind: ReviewKind, slug: string): Promise<ReviewFm | null>` — set `state: approved`; `null` if missing.
  - `getReview(feature: string, kind: ReviewKind, slug: string): Promise<{ data: ReviewFm; content: string } | null>`.
  - `resolveReviewSlug(feature: string, kind: ReviewKind, slug?: string): Promise<string | null>` — if `slug` given and the record exists, return it; else return the slug of the SOLE record of that kind in the feature, or `null` if zero or many.
  - `listReviews(state?: ReviewState): Promise<ReviewPointer[]>` — scan ALL features' `reviews/` dirs, optionally filter by state, sorted by `updated_at` desc.

- [ ] **Step 1: Write the failing test**

Create `tests/review-domain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import {
  openReview,
  setReviewFeedback,
  approveReview,
  getReview,
  resolveReviewSlug,
  listReviews,
  slugForPath,
} from "../src/domain/review.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-review-"));
  await initVault(dir);
}

test("slugForPath derives a kebab slug from the basename", () => {
  assert.equal(slugForPath("D:/x/docs/2026-OAuth Login.md"), "2026-oauth-login");
});

test("openReview creates a reviewing record", async () => {
  await freshVault();
  const fm = await openReview({ feature: "misa-payout", kind: "spec", path: "D:/x/oauth.md" });
  assert.equal(fm.kind, "spec");
  assert.equal(fm.slug, "oauth");
  assert.equal(fm.state, "reviewing");
  assert.equal(fm.path, "D:/x/oauth.md");
});

test("setReviewFeedback overwrites feedback and keeps reviewing", async () => {
  await freshVault();
  await openReview({ feature: "f1", kind: "spec", path: "D:/x/a.md" });
  await setReviewFeedback("f1", "spec", "a", "Thiếu refresh token.");
  let got = await getReview("f1", "spec", "a");
  assert.match(got?.content ?? "", /refresh token/);
  await setReviewFeedback("f1", "spec", "a", "Bản mới: thêm rate-limit.");
  got = await getReview("f1", "spec", "a");
  assert.match(got?.content ?? "", /rate-limit/);
  assert.doesNotMatch(got?.content ?? "", /refresh token/); // overwrite, no history
  assert.equal(got?.data.state, "reviewing");
});

test("approveReview flips state; missing record returns null", async () => {
  await freshVault();
  await openReview({ feature: "f1", kind: "spec", path: "D:/x/a.md" });
  const ok = await approveReview("f1", "spec", "a");
  assert.equal(ok?.state, "approved");
  assert.equal(await approveReview("f1", "spec", "ghost"), null);
});

test("resolveReviewSlug returns the sole record when slug omitted", async () => {
  await freshVault();
  await openReview({ feature: "f1", kind: "spec", path: "D:/x/only.md" });
  assert.equal(await resolveReviewSlug("f1", "spec"), "only");
  await openReview({ feature: "f1", kind: "spec", path: "D:/x/second.md" });
  assert.equal(await resolveReviewSlug("f1", "spec"), null); // ambiguous
  assert.equal(await resolveReviewSlug("f1", "spec", "second"), "second");
});

test("listReviews scans all features and filters by state", async () => {
  await freshVault();
  await openReview({ feature: "fa", kind: "spec", path: "D:/x/a.md" });
  await openReview({ feature: "fb", kind: "plan", path: "D:/x/b.md" });
  await approveReview("fb", "plan", "b");
  const reviewing = await listReviews("reviewing");
  assert.deepEqual(reviewing.map((r) => r.feature), ["fa"]);
  const all = await listReviews();
  assert.equal(all.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/review-domain.test.js`
Expected: build error — module missing.

- [ ] **Step 3: Implement the module**

`src/domain/review.ts`:

```ts
import path from "node:path";
import {
  getPaths,
  readMarkdown,
  writeMarkdown,
  listFiles,
  listDirs,
} from "../vault/vault-io.js";
import { slugify } from "../utils/slug.js";
import { nowIso } from "../utils/time.js";

export type ReviewKind = "spec" | "plan";
export type ReviewState = "reviewing" | "approved";

export interface ReviewFm {
  kind: ReviewKind;
  slug: string;
  feature: string;
  path: string;
  state: ReviewState;
  updated_at: string;
}

export interface ReviewPointer {
  feature: string;
  kind: ReviewKind;
  slug: string;
  path: string;
  state: ReviewState;
}

const NO_FEEDBACK = "_No feedback yet._";

export function slugForPath(docPath: string): string {
  const base = path.basename(docPath, path.extname(docPath));
  return slugify(base) || "review";
}

function buildBody(slug: string, feedback: string): string {
  return [`# Review: ${slug}`, "", "## Feedback", "", feedback, ""].join("\n");
}

async function writeRecord(fm: ReviewFm, feedback: string): Promise<ReviewFm> {
  await writeMarkdown(
    getPaths().featureReviewFile(fm.feature, fm.kind, fm.slug),
    fm as unknown as Record<string, unknown>,
    buildBody(fm.slug, feedback),
  );
  return fm;
}

export async function openReview(input: {
  feature: string;
  kind: ReviewKind;
  path: string;
}): Promise<ReviewFm> {
  const slug = slugForPath(input.path);
  const fm: ReviewFm = {
    kind: input.kind,
    slug,
    feature: input.feature,
    path: input.path,
    state: "reviewing",
    updated_at: nowIso(),
  };
  return writeRecord(fm, NO_FEEDBACK);
}

export async function getReview(
  feature: string,
  kind: ReviewKind,
  slug: string,
): Promise<{ data: ReviewFm; content: string } | null> {
  const parsed = await readMarkdown<ReviewFm>(getPaths().featureReviewFile(feature, kind, slug));
  return parsed ? { data: parsed.data, content: parsed.content } : null;
}

export async function setReviewFeedback(
  feature: string,
  kind: ReviewKind,
  slug: string,
  feedback: string,
): Promise<ReviewFm | null> {
  const existing = await readMarkdown<ReviewFm>(getPaths().featureReviewFile(feature, kind, slug));
  if (!existing) return null;
  const fm: ReviewFm = { ...existing.data, state: "reviewing", updated_at: nowIso() };
  return writeRecord(fm, feedback);
}

export async function approveReview(
  feature: string,
  kind: ReviewKind,
  slug: string,
): Promise<ReviewFm | null> {
  const existing = await readMarkdown<ReviewFm>(getPaths().featureReviewFile(feature, kind, slug));
  if (!existing) return null;
  const fm: ReviewFm = { ...existing.data, state: "approved", updated_at: nowIso() };
  const feedback = existing.content.includes("## Feedback")
    ? existing.content.split("## Feedback")[1].trim() || NO_FEEDBACK
    : NO_FEEDBACK;
  return writeRecord(fm, feedback);
}

async function listFeatureReviews(feature: string): Promise<ReviewPointer[]> {
  const files = await listFiles(getPaths().featureReviewsDir(feature), ".md");
  const out: ReviewPointer[] = [];
  for (const file of files) {
    const parsed = await readMarkdown<ReviewFm>(
      path.join(getPaths().featureReviewsDir(feature), file),
    );
    if (!parsed) continue;
    out.push({
      feature: parsed.data.feature,
      kind: parsed.data.kind,
      slug: parsed.data.slug,
      path: parsed.data.path,
      state: parsed.data.state,
    });
  }
  return out;
}

export async function resolveReviewSlug(
  feature: string,
  kind: ReviewKind,
  slug?: string,
): Promise<string | null> {
  if (slug) {
    const exists = await readMarkdown<ReviewFm>(getPaths().featureReviewFile(feature, kind, slug));
    return exists ? slug : null;
  }
  const ofKind = (await listFeatureReviews(feature)).filter((r) => r.kind === kind);
  return ofKind.length === 1 ? ofKind[0].slug : null;
}

export async function listReviews(state?: ReviewState): Promise<ReviewPointer[]> {
  const features = await listDirs(getPaths().featuresDir);
  const out: ReviewPointer[] = [];
  for (const feature of features) {
    for (const r of await listFeatureReviews(feature)) {
      if (!state || r.state === state) out.push(r);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/review-domain.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/review.ts tests/review-domain.test.ts
git commit -m "feat: add review domain (per-feature spec/plan review state)"
```

---

### Task 3: review_open + review_note + review_get + review_approve tools

**Files:**
- Create: `src/tools/review-open.ts`
- Create: `src/tools/review-note.ts`
- Create: `src/tools/review-get.ts`
- Create: `src/tools/review-approve.ts`
- Modify: `src/tools/index.ts`
- Test: `tests/review-tools.test.ts`

**Interfaces:**
- Consumes: `ToolContext`, `ToolDef` (`tools/types.js`); `openReview`, `setReviewFeedback`, `approveReview`, `getReview`, `resolveReviewSlug` (Task 2); `registerTools` for the test.
- Produces: `reviewOpenTool(ctx)` (`review_open`), `reviewNoteTool(ctx)` (`review_note`), `reviewGetTool(ctx)` (`review_get`), `reviewApproveTool(ctx)` (`review_approve`), registered after `memoryPromoteTool(ctx),`. `review_note`/`review_get`/`review_approve` accept an optional `slug` and resolve it via `resolveReviewSlug` (warning if ambiguous/missing).

- [ ] **Step 1: Write the failing test**

Create `tests/review-tools.test.ts`:

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/review-tools.test.js`
Expected: build error — modules / registrations missing.

- [ ] **Step 3: Create `src/tools/review-open.ts`**

```ts
import { z } from "zod";
import { openReview } from "../domain/review.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  kind: z.enum(["spec", "plan"]),
  path: z.string().min(1),
});

export function reviewOpenTool(_ctx: ToolContext): ToolDef {
  return {
    name: "review_open",
    description:
      "Register a spec/plan document for review (state: reviewing). Call this after you produce a spec or plan, so another CLI can find and review it through the shared vault — no copy-paste of the path. Re-opening the same document overwrites its record (no new file).",
    annotations: { title: "Review Open", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug the spec/plan belongs to." },
        kind: { type: "string", enum: ["spec", "plan"], description: "spec | plan." },
        path: { type: "string", description: "Absolute path to the spec/plan document." },
      },
      required: ["feature", "kind", "path"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide feature, kind, path."], artifacts: [] };
      }
      const review = await openReview(parsed.data);
      return {
        status: "success",
        summary: `Review opened: ${review.feature}/${review.kind}-${review.slug} (reviewing)`,
        next_actions: ["Another CLI can find it via review_list('reviewing')"],
        artifacts: [`features/${review.feature}/reviews/${review.kind}-${review.slug}.md`],
        data: { review },
      };
    },
  };
}
```

- [ ] **Step 4: Create `src/tools/review-note.ts`**

```ts
import { z } from "zod";
import { resolveReviewSlug, setReviewFeedback } from "../domain/review.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  kind: z.enum(["spec", "plan"]),
  feedback: z.string().min(1),
  slug: z.string().optional(),
});

export function reviewNoteTool(_ctx: ToolContext): ToolDef {
  return {
    name: "review_note",
    description:
      "Write review feedback for a spec/plan under review (OVERWRITES the previous feedback — latest only, no history). Use after reading the document at its path. The other CLI reads this via review_get — no copy-paste. Omit slug if the feature has a single record of that kind.",
    annotations: { title: "Review Note", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug." },
        kind: { type: "string", enum: ["spec", "plan"] },
        feedback: { type: "string", description: "The review feedback (overwrites the previous)." },
        slug: { type: "string", description: "Optional; needed only if several records of that kind exist." },
      },
      required: ["feature", "kind", "feedback"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide feature, kind, feedback."], artifacts: [] };
      }
      const { feature, kind, feedback, slug } = parsed.data;
      const resolved = await resolveReviewSlug(feature, kind, slug);
      if (!resolved) {
        return { status: "warning", summary: `No single ${kind} review for ${feature}`, next_actions: ["Pass an explicit slug, or review_open first."], artifacts: [] };
      }
      const review = await setReviewFeedback(feature, kind, resolved, feedback);
      return {
        status: "success",
        summary: `Feedback saved: ${feature}/${kind}-${resolved} (reviewing)`,
        next_actions: ["The author CLI reads it via review_get"],
        artifacts: [`features/${feature}/reviews/${kind}-${resolved}.md`],
        data: { review },
      };
    },
  };
}
```

- [ ] **Step 5: Create `src/tools/review-get.ts`**

```ts
import { z } from "zod";
import { resolveReviewSlug, getReview } from "../domain/review.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  kind: z.enum(["spec", "plan"]),
  slug: z.string().optional(),
});

export function reviewGetTool(_ctx: ToolContext): ToolDef {
  return {
    name: "review_get",
    description:
      "Read a spec/plan review record: its state and the latest feedback. Call this to pull review feedback without copy-paste before revising the document. Omit slug if the feature has a single record of that kind.",
    annotations: { title: "Review Get", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug." },
        kind: { type: "string", enum: ["spec", "plan"] },
        slug: { type: "string", description: "Optional; needed only if several records of that kind exist." },
      },
      required: ["feature", "kind"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide feature and kind."], artifacts: [] };
      }
      const { feature, kind, slug } = parsed.data;
      const resolved = await resolveReviewSlug(feature, kind, slug);
      if (!resolved) {
        return { status: "warning", summary: `No single ${kind} review for ${feature}`, next_actions: ["Pass an explicit slug, or review_open first."], artifacts: [] };
      }
      const review = await getReview(feature, kind, resolved);
      if (!review) {
        return { status: "warning", summary: `Review not found: ${feature}/${kind}-${resolved}`, next_actions: ["Check the slug."], artifacts: [] };
      }
      return {
        status: "success",
        summary: `Review ${feature}/${kind}-${resolved} (${review.data.state})`,
        next_actions: review.data.state === "reviewing" ? ["Revise the doc at review.data.path, then ask to re-review"] : ["Approved — proceed"],
        artifacts: [`features/${feature}/reviews/${kind}-${resolved}.md`],
        data: { frontmatter: review.data, content: review.content },
      };
    },
  };
}
```

- [ ] **Step 6: Create `src/tools/review-approve.ts`**

```ts
import { z } from "zod";
import { resolveReviewSlug, approveReview } from "../domain/review.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  kind: z.enum(["spec", "plan"]),
  slug: z.string().optional(),
});

export function reviewApproveTool(_ctx: ToolContext): ToolDef {
  return {
    name: "review_approve",
    description:
      "Mark a spec/plan review as approved (state: reviewing -> approved). The user triggers this when satisfied. Omit slug if the feature has a single record of that kind.",
    annotations: { title: "Review Approve", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug." },
        kind: { type: "string", enum: ["spec", "plan"] },
        slug: { type: "string", description: "Optional; needed only if several records of that kind exist." },
      },
      required: ["feature", "kind"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide feature and kind."], artifacts: [] };
      }
      const { feature, kind, slug } = parsed.data;
      const resolved = await resolveReviewSlug(feature, kind, slug);
      if (!resolved) {
        return { status: "warning", summary: `No single ${kind} review for ${feature}`, next_actions: ["Pass an explicit slug."], artifacts: [] };
      }
      const review = await approveReview(feature, kind, resolved);
      return {
        status: "success",
        summary: `Review approved: ${feature}/${kind}-${resolved}`,
        next_actions: kind === "spec" ? ["Proceed to write the plan"] : ["Proceed to implement"],
        artifacts: [`features/${feature}/reviews/${kind}-${resolved}.md`],
        data: { review },
      };
    },
  };
}
```

- [ ] **Step 7: Register the four tools in `src/tools/index.ts`**

Add imports after the existing tool imports:

```ts
import { reviewOpenTool } from "./review-open.js";
import { reviewNoteTool } from "./review-note.js";
import { reviewGetTool } from "./review-get.js";
import { reviewApproveTool } from "./review-approve.js";
```

Add to the `registerTools` return array (after `memoryPromoteTool(ctx),`):

```ts
    reviewOpenTool(ctx),
    reviewNoteTool(ctx),
    reviewGetTool(ctx),
    reviewApproveTool(ctx),
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run build && node --test dist/tests/review-tools.test.js`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add src/tools/review-open.ts src/tools/review-note.ts src/tools/review-get.ts src/tools/review-approve.ts src/tools/index.ts tests/review-tools.test.ts
git commit -m "feat: add review_open/note/get/approve tools"
```

---

### Task 4: review_list tool (discovery) + protocol

**Files:**
- Create: `src/tools/review-list.ts`
- Modify: `src/tools/index.ts`
- Modify: `memory-protocol.md`
- Test: `tests/review-list-tool.test.ts`

**Interfaces:**
- Consumes: `ToolContext`, `ToolDef`; `listReviews` (Task 2); `openReview`, `approveReview` (Task 2, for the test); `registerTools`.
- Produces: `reviewListTool(ctx)` (`review_list`) registered after `reviewApproveTool(ctx),`.

- [ ] **Step 1: Write the failing test**

Create `tests/review-list-tool.test.ts`:

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tests/review-list-tool.test.js`
Expected: build error — module / registration missing.

- [ ] **Step 3: Create `src/tools/review-list.ts`**

```ts
import { z } from "zod";
import { listReviews } from "../domain/review.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  state: z.enum(["reviewing", "approved"]).optional(),
});

export function reviewListTool(_ctx: ToolContext): ToolDef {
  return {
    name: "review_list",
    description:
      "List spec/plan review records across all features (optionally filtered by state, e.g. 'reviewing'). Use this when the user asks 'which spec/plan needs review?' — it finds pending items + their paths through the shared vault, so you never copy a path.",
    annotations: { title: "Review List", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["reviewing", "approved"], description: "Optional filter." },
      },
      required: [],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["state must be 'reviewing' or 'approved'."], artifacts: [] };
      }
      const reviews = await listReviews(parsed.data.state);
      return {
        status: "success",
        summary: `${reviews.length} review record(s)${parsed.data.state ? ` in ${parsed.data.state}` : ""}`,
        next_actions: reviews.length ? ["Open a doc at its path, then review_note / review_get"] : ["Nothing pending"],
        artifacts: [],
        data: { reviews },
      };
    },
  };
}
```

- [ ] **Step 4: Register in `src/tools/index.ts`**

Add the import after the Task 3 imports:

```ts
import { reviewListTool } from "./review-list.js";
```

Add to the `registerTools` return array (after `reviewApproveTool(ctx),`):

```ts
    reviewListTool(ctx),
```

- [ ] **Step 5: Run the new test + whole suite + typecheck**

Run: `npm run build && node --test dist/tests/review-list-tool.test.js`
Expected: PASS (2 tests).

Then: `npm run build && node --test dist/tests/*.test.js && npm run typecheck`
Expected: ALL tests pass, no type errors.

- [ ] **Step 6: Append the REVIEW section to `memory-protocol.md`**

Append to `memory-protocol.md` (after the SELF-LEARN section, before "The test for saving"):

````markdown
## REVIEW HANDOFF — spec/plan review across CLIs
- After you produce a spec/plan (e.g. via /brainstorming) → `review_open(feature, kind, path)` (state: reviewing).
- When the user asks "which spec/plan needs review?" → `review_list("reviewing")` and show them; you do NOT
  need a path — it comes from the record.
- When asked to review a pending item → read the document at its `path`, then `review_note(feature, kind, feedback)`
  (overwrites the previous feedback — latest only).
- When resuming a spec/plan under review → `review_get(feature, kind)` to read the latest feedback before revising.
- When the user accepts → `review_approve(feature, kind)`.
- Never copy the path or the feedback by hand — they live in the vault; read/write them through these tools.
````

- [ ] **Step 7: Commit**

```bash
git add src/tools/review-list.ts src/tools/index.ts memory-protocol.md tests/review-list-tool.test.ts
git commit -m "feat: add review_list tool + review handoff protocol"
```

---

## Self-Review

**Spec coverage:**
- §3 model (per-feature record, `feature+kind+slug`, 2 states, overwrite) → Tasks 1, 2. ✓
- §4 data shape (frontmatter + Feedback body) → Task 2. ✓
- §5 tools `review_open/note/list/get/approve` → Tasks 3, 4. ✓
- §6 workflow (open → note → get → approve, no copy-paste) → Tasks 3, 4 + the round-trip test. ✓
- §7 protocol additions → Task 4 Step 6. (The mirrored `~/.claude/CLAUDE.md` block is an interactive post-merge step, like prior installs.) ✓
- §8 error handling (missing record → warning; unknown feature → []; bad input → error) → Tasks 3, 4. ✓
- §2 non-goals (no history/thread → overwrite; gateway doesn't edit the doc) → honored (only the review record is written; feedback overwritten). ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. `NO_FEEDBACK` placeholder text is content, not a plan gap.

**Type consistency:** `ReviewFm`/`ReviewPointer`/`ReviewKind`/`ReviewState` (Task 2) consumed by Tasks 3, 4 with matching names. `openReview` takes `{feature,kind,path}`; `setReviewFeedback`/`approveReview`/`getReview` take `(feature, kind, slug)`; `resolveReviewSlug` bridges optional slug. Tools return `data.review` (open/note/approve) and `data.reviews` (list) and `data.frontmatter/content` (get) — consistent with the tests. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-agent-gateway-review-handoff.md`. The mirrored `~/.claude/CLAUDE.md` REVIEW block is an interactive post-merge step.

Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
