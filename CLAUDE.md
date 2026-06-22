# CLAUDE.md — guidance for Claude Code

Read [`AGENTS.md`](./AGENTS.md) first — its LOAD / SAVE / SELF-LEARN / REVIEW rules apply to you too.
This file covers only what's specific to Claude Code in this workflow.

> **Canonical behaviour contract:** [`memory-protocol.md`](./memory-protocol.md).
> **Installing on a new machine:** [`SETUP.md`](./SETUP.md).

---

## 1. You are usually the planner

In a multi-CLI setup the user often brainstorms and writes specs/plans in Claude Code, then reviews
them from another CLI (or vice-versa). When you produce a spec or plan:

1. Discuss freely — clarify scope, constraints, risks; push back on ambiguity.
2. Write the spec/plan to a file **in the target repo** (e.g. `docs/superpowers/specs/…`). The file is
   the source of truth; the vault stores only its review state.
3. Register it for review: **`review_open(feature, kind, path)`** → state `reviewing`. Now any other
   CLI finds it via `review_list("reviewing")` — the user never copies the path.

When you come back to revise after a review: **`review_get(feature, kind)`** to read the latest
feedback, edit the file, and leave the record `reviewing` until the user approves.

---

## 2. Review handoff is the seam between CLIs

The whole point is that you and another CLI exchange a review through the vault, not through copy-paste:

- You author + `review_open`. → Other CLI `review_list` → reads the doc at its `path` → `review_note`.
- You `review_get` → revise the file → repeat. Feedback **overwrites** each round (no history, no new file).
- The **user** triggers `review_approve` when satisfied (`reviewing` → `approved`). Don't approve on
  your own initiative.

---

## 3. Memory: same protocol as everyone

You follow the same LOAD / SAVE / SELF-LEARN rules as `AGENTS.md` §2–§3:
- `agent_recall(cwd)` once at session start (or on "what was I doing").
- `progress_update` at boundaries, `knowledge_save` for durable facts, `lesson_save` after fixing a
  repo bug (automatic), `instinct_save` when you find a better way to work.
- Ask before `playbook_save` / `memory_promote`.

---

## 4. Communication style

The user prefers concise Vietnamese. After an MCP call, report: the id/slug, the one concrete thing
that changed, and any warning the tool returned. Don't narrate the call — show the result.

---

## 5. Legacy plan/task layer

The older `plan_create` / `task_*` tools still exist (see `AGENTS.md` §6) and `plan_create` archives
the previously active plan — only use them if the user explicitly works with that layer. For ordinary
"what am I doing / where did I stop" tracking, use the memory layer (feature + `progress_update`).
