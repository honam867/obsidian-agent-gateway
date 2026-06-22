# AGENTS.md — guidance for any coding agent (Codex, OpenCode, Cursor, …)

This file tells an agent how to behave inside a workspace that uses `obsidian-agent-gateway` as its
shared memory + coordination layer. It applies to **any** CLI — the vault is the common brain, not
tied to one tool.

> **First time on this machine?** The server may not be installed yet. See [`SETUP.md`](./SETUP.md)
> for the one-time install + wiring runbook.
>
> **Canonical behaviour contract:** [`memory-protocol.md`](./memory-protocol.md). This file is a
> role-oriented summary; if they ever disagree, `memory-protocol.md` wins.

---

## 1. Your role

- The user works across **multiple CLIs** sharing **one Obsidian vault**. There is no "main" CLI —
  whichever one is open reads and writes the same brain.
- You are a competent **coder**, and a **reviewer** when asked. Memory/review is automatic, low-noise:
  act only at the moments in §2–§4, never on every message.
- The **user** decides when something is truly done. Don't mark work complete on your own initiative.

---

## 2. First action in every session (LOAD)

Call **`agent_recall`** once, passing your absolute `cwd`. It resolves the repo + the feature you last
worked on and returns last action, next step, knowledge pointers, and top instincts/lessons/playbooks.

- Call it **once per session** and reuse the result. Don't re-recall unless the feature changes.
- You do **not** need to know the feature slug — `agent_recall` resolves it from `cwd`.
- When the user says *"what was I doing / continue / where did I leave off / which repo"* → this is the call.
- On a brand-new machine it returns `how: "none"` (no history yet) — that's normal.

**Then apply what it loaded:** read the repo lessons + playbooks it returns and use them — skip a known
error straight to its fix, follow a known playbook — before re-discovering anything.

---

## 3. Saving — at meaningful boundaries only (SAVE)

Save incrementally at each boundary; don't wait for the end (the session may stop first).

| Call | When |
|---|---|
| `progress_update(feature, last_action, next_step)` | A meaningful step completes, you switch tasks, or you wrap up. |
| `context_set(feature, repos, paths)` | The user clearly moves to a different feature/initiative (short kebab-case label, list every repo it spans). |
| `knowledge_save(repo, area, body, source_paths)` | You learn a durable codebase fact (architecture, convention, gotcha, run/test command). |
| `lesson_save(repo, slug, symptom, cause, fix)` | **After you fix a repo-specific bug/incident — automatic, no need to ask.** |
| `instinct_save(slug, title, trigger, action, why)` | You hit friction and found a better way to *work* (re-saving the same slug reinforces it). |

The test for saving: **save only if the next session would need it to continue.** Never save trivial
facts, raw tool output, secrets, or on every message.

### Proactive promotion (ask first)
- A pattern recurred or the user calls a method reusable → ask, then `playbook_save(repo, slug, title, steps)`.
- A repo lesson clearly applies across repos → ask, then `memory_promote(repo, lesson_slug)` (lesson → global instinct).

---

## 4. Review handoff — spec/plan review across CLIs

The vault is the middle layer so two CLIs ping-pong a review **without copy-pasting paths or feedback**.

| Call | Who / when |
|---|---|
| `review_open(feature, kind, path)` | Author CLI, after producing a spec/plan (e.g. via brainstorming). State → `reviewing`. |
| `review_list("reviewing")` | Reviewer CLI asked *"which spec/plan needs review?"* — returns the path; you never copy it. |
| `review_note(feature, kind, feedback)` | Reviewer, after reading the doc at its `path`. **Overwrites** previous feedback (latest only). |
| `review_get(feature, kind)` | Author, to read the latest feedback before revising. |
| `review_approve(feature, kind)` | When the **user** accepts. State `reviewing` → `approved`. |

The **spec/plan file itself is edited in the repo by the agent** — the vault only stores the review +
state. One record per feature/kind; notes overwrite, no new file per round.

---

## 5. What NOT to do

- Don't recall repeatedly within a session, or save on every message.
- Don't invent feature slugs — let `agent_recall` / the user supply them.
- Don't copy review paths or feedback by hand — read/write them through the review tools.
- Don't mark work done just because tests pass — the user decides.
- Writes are atomic at the file level; there is no lock. If you see another session's in-progress
  state, surface it to the user rather than clobbering it.

---

## 6. Legacy plan/task tools (still available)

An older structured plan/task layer (`agent_boot`, `plan_create`, `task_*`, `review_submit`,
`project_relink`) is still registered for backward compatibility. The memory layer above (feature +
working memory) is the current default for tracking "what I'm doing / where I stopped". Use the legacy
plan/task tools only if the user explicitly works with them.
