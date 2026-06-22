# Design — Agent Gateway Review Handoff (spec/plan state across CLIs)

- Status: draft (awaiting user review)
- Created: 2026-06-22
- Repo: `obsidian-agent-gateway`
- Builds on: the memory layer (features/repos/global) — merged.

## 1. Problem

The user's workflow with the `/brainstorming` (superpowers) plugin:
1. CLI A (in a repo) produces a spec/plan **file** (under `docs/superpowers/specs|plans/`).
2. The user switches to **another CLI** (any model — they share the same gateway vault) to review /
   break it down.
3. Today the handoff is manual: copy the spec's **path** into CLI B, paste, ask for review, copy the
   **feedback** back into CLI A, ask it to revise, switch back to re-check… a copy-paste ping-pong.

We want Obsidian (the shared vault) to be the **middle layer**: the spec/plan's **state** and the
**latest review feedback** live in the vault, so any CLI can discover "what's waiting for review",
read the feedback, and move the state forward — **without the user copying paths or feedback**.

The spec/plan **document itself** is edited in place by the agent (superpowers handles that) — out of
scope here. This feature only tracks the **review record + state** in the vault.

## 2. Goals / Non-goals

**Goals**
- A lightweight **review record** per spec/plan, stored in the vault, keyed by feature.
- Two states only: `reviewing` (on open) → `approved` (on accept).
- Latest review feedback stored in the vault (**overwritten**, no history/thread) so CLI B writes it
  and CLI A reads it — no copy-paste.
- A discovery query: "which specs/plans are in `reviewing`?" so the other CLI finds it without a path.

**Non-goals (explicitly out, per the user)**
- No review history / thread / per-round files. Feedback is **overwritten** (latest only).
- The gateway does NOT edit the spec/plan document — the agent does that.
- No reviewer-identity / model tracking — the user picks which CLI; the gateway just connects them.
- No approval gating of implementation (the agent/user decide when to implement).

## 3. Model (kept simple)

A **review record** = one markdown file in the vault, keyed by `feature + kind + slug`:

```
features/<feature>/reviews/<kind>-<slug>.md
```
- `kind` ∈ `spec | plan`.
- `slug` derives from the document path's basename (so re-opening the SAME document hits the SAME
  record — overwrite, never a new file per round). A different document → a different record.

**State machine (2 states):**
```
review_open  ──▶  reviewing  ──review_approve──▶  approved
                     ▲                                │
                     └──────── review_open ───────────┘   (re-open if changes needed)
```

**Overwrite semantics:** `review_open` and `review_note` REPLACE the record's fields — no append, no
history. Only the latest feedback + current state are kept.

## 4. Data shape

`features/<feature>/reviews/<kind>-<slug>.md`:
```yaml
---
kind: spec                 # spec | plan
slug: oauth-login
feature: misa-payout
path: D:/working/cozrum-server/docs/superpowers/specs/2026-...-oauth.md   # pointer to the document
state: reviewing           # reviewing | approved
updated_at: <iso>
---
# Review: oauth-login

## Feedback
<latest review feedback only — overwritten each time; empty until CLI B writes it>
```

## 5. Tools (all return the observation contract)

- `review_open(feature, kind, path, title?)` — create/**overwrite** the record → `state: reviewing`,
  feedback cleared. CLI A calls this right after producing the spec/plan.
- `review_note(feature, kind, slug?, feedback)` — **overwrite** the feedback text (state stays
  `reviewing`). CLI B calls this after reviewing the document. `slug` optional if a feature has one
  record of that kind; required to disambiguate if several.
- `review_list(state?)` — list review records (optionally filtered, e.g. `reviewing`). Returns
  `{ feature, kind, slug, path, state }` per record — the discovery query ("what needs review?").
- `review_get(feature, kind, slug?)` — read one record: `state` + `path` + latest `feedback`. CLI A
  calls this to read the feedback without copy-paste.
- `review_approve(feature, kind, slug?)` — set `state: approved`. The user triggers this ("ok rồi").

(`review_list` is the cross-CLI discovery; `review_get` is the no-copy feedback read; `review_note`
is the no-copy feedback write. Together they remove the copy-paste loop.)

## 6. The workflow it enables

```
CLI A (repo X): produces spec → review_open(feature, spec, path)        [reviewing]
   — user switches to CLI B —
CLI B: user asks "spec nào cần review?" → review_list("reviewing")       → sees record + path
        reads the doc at `path`, reviews → review_note(feature, spec, feedback)   [overwrite]
   — user switches back to CLI A —
CLI A: review_get(feature, spec) → reads latest feedback → revises the doc
   — re-review: CLI B review_note again (overwrite), or —
   — user satisfied: review_approve(feature, spec)                        [approved]
```
No path or feedback is ever copied by hand; both live in the vault.

## 7. Protocol additions (memory-protocol.md)

A REVIEW section telling agents:
- After producing a spec/plan with `/brainstorming` (or on request) → `review_open`.
- When the user asks "what needs review / which spec is pending" → `review_list("reviewing")`.
- When asked to review a pending item → read its `path`, then `review_note` with the feedback.
- When resuming a spec under review → `review_get` to read the latest feedback before revising.
- When the user accepts → `review_approve`.

## 8. Error handling

- `review_note` / `review_get` / `review_approve` on a missing record → `status: "warning"` with a
  hint to `review_open` first / check the slug.
- Unknown feature → `review_list` returns `[]` (like the other list tools).
- Missing required field → `status: "error"` via zod safeParse (existing pattern).

## 9. Testing

- Unit: `review_open` writes a `reviewing` record (overwrite, not duplicate); `review_note` overwrites
  feedback and keeps state; `review_approve` flips to `approved`; `review_list` filters by state;
  `review_get` returns latest feedback; unknown record → warning.
- Integration: full loop open → note → get → approve across the same feature.
- Contract: every tool returns `status/summary/next_actions/artifacts`.

## 10. Open questions (deferred)

- Multiple specs of the same kind per feature: handled by `slug`, but the default single-record path
  (omit slug) is the common case.
- Whether `review_approve` on a plan should auto-set the feature's working `active_task` — left manual.
