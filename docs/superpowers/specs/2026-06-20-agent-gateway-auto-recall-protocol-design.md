# Design — Agent Gateway Auto-Recall + Memory Protocol (the "last mile")

- Status: draft (awaiting user review)
- Created: 2026-06-20
- Repo: `obsidian-agent-gateway`
- Builds on: Plan 1 (scope foundation) + Plan B (memory tiers, 5 tools) — both merged.

## 1. Problem

The memory tools work (verified live through Claude), but they are **not used automatically**.
An MCP server is passive: the agent only calls a tool when explicitly told. So today the user
must type a technical prompt ("Dùng obsidian-agent-gateway, gọi `memory_recall` cho feature
`agent-gateway-harness`") instead of a natural one ("Session trước đang làm gì và ở repo nào?").

We want: open Claude (or OpenCode/Codex) in any repo, work naturally, and the agent **self-drives**
the memory — recalling on start, saving at the right moments — without the user naming tools or
feature slugs, and **without CLI-specific hooks** (so one solution works across all CLIs).

## 2. Goals / Non-goals

**Goals**
- A natural query ("đang làm gì / tiếp tục / session trước…") makes the agent auto-load memory,
  resolving the repo + feature itself from `cwd`.
- A single, portable protocol that tells any agent WHEN to call WHICH memory tool, and when NOT to
  (flexible, low-noise).
- Cross-CLI: Claude Code + OpenCode + Codex, from one source of truth.

**Non-goals (deferred / out of scope)**
- CLI-specific hooks (SessionStart/PreCompact/Stop). Instruction-driven is chosen for portability.
  A guaranteed hard trigger can be added later as a thin per-CLI hook if needed.
- lessons/playbooks tiers, `memory_get`/`memory_search`, staleness-by-git, promotion. Separate plans.
- The project→feature swap of the old plan/task machinery.

**Accepted trade-off:** instruction-driven automation is "soft" — it depends on the agent obeying
the protocol. Strong models follow it reliably; this is the cost of cross-CLI portability.

## 3. Architecture (3 parts)

```
(A) NEW MCP tool agent_recall(cwd)   — one "front door": auto-resolve repo+feature, return recall bundle
(B) memory-protocol.md               — the WHEN-to-call rules (one source of truth)
(C) Global-instruction install       — each CLI's GLOBAL instruction file points to (B)
```

- **(A)** removes the need for the agent to chain `context_set` + `memory_recall` and to know the
  feature slug. The agent calls `agent_recall(cwd)`; the server figures out the rest.
- **(B)** is a plain markdown protocol the agent reads (via its instruction file). It maps natural
  intents → tool calls and defines anti-noise rules.
- **(C)** makes it always-on across every repo: the protocol lives in each CLI's GLOBAL instruction
  file (not per-project), all referencing the same `memory-protocol.md`.

## 4. Scope resolution (option b: remember last-active feature per repo)

- `workspace.json` repo entries gain a field **`active_feature`** (the feature last worked on in that
  repo).
- `context_set(feature, repos[])` sets `active_feature = feature` on each listed repo, and bumps the
  feature's `updated_at`.
- `progress_update(feature, …)` bumps that feature's `updated_at` too (so "most recently worked
  feature" reflects real activity).

**`agent_recall(cwd)` resolution algorithm:**
1. Resolve a repo for `cwd`: the registered repo whose path equals `cwd` or is an ancestor of `cwd`;
   else if `cwd` is itself a git root, register it.
2. If a repo is found and has `active_feature` → use it.
3. Else (no repo match — e.g. `cwd` is the workspace root, or repo has no active feature) → use the
   **globally most-recently-updated feature** (max `updated_at` across `workspace.json` features).
4. If there are no features at all → return `status: "warning"` telling the agent to `context_set`.
5. Return the `recall(feature)` bundle plus `resolved: { repo, feature, how }` where `how` ∈
   `"repo-active" | "global-recent" | "none"`.

This covers both "I opened Claude inside `cozrum-server`" (→ repo's active feature) and "I work from
root `D:/working`" (→ the last feature I touched anywhere).

## 5. Data shapes (delta from Plan 1/B)

**`workspace.json` repo entry** — add `active_feature`:
```json
"cozrum-server": {
  "slug": "cozrum-server",
  "path": "D:/working/cozrum-server",
  "registered_at": "…",
  "active_feature": "misa-payout"
}
```
(Field is optional/absent until first `context_set` names the repo.)

**`agent_recall` response** (observation contract):
```json
{
  "status": "success",
  "summary": "Resumed misa-payout (repo cozrum-server): last action …",
  "next_actions": ["Read progress.next_step", "context_set to switch feature"],
  "artifacts": ["features/misa-payout/working/current.md"],
  "data": {
    "resolved": { "repo": "cozrum-server", "feature": "misa-payout", "how": "repo-active" },
    "recall": { /* same shape as memory_recall.data: feature, progress, knowledge, instincts */ }
  }
}
```

## 6. The memory protocol (content of `memory-protocol.md`)

Written for any coding agent. The canonical rules:

**LOAD (recall):**
- As the FIRST action of a session, OR whenever the user asks "what was I doing / continue / where
  did I leave off / which repo", call `agent_recall` with your current working directory. Call it
  ONCE per session; cache the result. Do not re-recall unless the feature changes.

**SWITCH CONTEXT:**
- When the user clearly moves to a different feature/initiative, call `context_set(feature, repos,
  paths)`.

**SAVE (high-signal, at boundaries — NOT every message):**
- `progress_update` — when a meaningful step/task completes, when switching tasks, and when wrapping
  up. Save INCREMENTALLY at each boundary (don't wait for the end — the session may die first).
- `knowledge_save` — when you learn a durable codebase fact worth reusing (architecture, convention,
  gotcha, run/test command).
- `instinct_save` — when you hit friction and found a better way to WORK (re-saving the same slug
  reinforces it).

**DO NOT:**
- Save on every message; save trivial/obvious facts, raw tool output, or secrets; recall repeatedly;
  invent feature slugs (let `agent_recall` resolve them).

**Guiding test:** save something only if the next session would need it to continue.

## 7. Installation (part C)

- Canonical protocol file: `obsidian-agent-gateway/memory-protocol.md` (source of truth in the repo).
- A short pointer block is added to each CLI's GLOBAL instruction file, referencing the protocol:
  - **Claude Code:** `~/.claude/CLAUDE.md` (user-level memory, applied to every project).
  - **OpenCode:** its global `AGENTS.md` / instruction file.
  - **Codex:** its global `AGENTS.md`.
- The pointer block is delimited by managed markers (e.g. `<!-- agent-gateway-memory:start/end -->`)
  so it can be updated/removed idempotently without disturbing the user's other instructions.
- The exact OpenCode/Codex global-instruction path is confirmed during implementation; the install
  is the same shape for all three (append a marked pointer block).

## 8. Error handling

- `cwd` not under any repo and no features exist → `status: "warning"`, `next_actions` → `context_set`.
- Unknown/empty feature after resolution → return global instincts only (like `memory_recall` today).
- `agent_recall` never throws on a missing vault entry — it degrades to a warning with guidance.

## 9. Testing

- Unit: `active_feature` set by `context_set`; feature `updated_at` bumped by `context_set` and
  `progress_update`; `agent_recall` resolution for (a) cwd inside a registered repo with active
  feature, (b) cwd = workspace root → global-recent feature, (c) no features → warning.
- Integration: `agent_recall` returns the full recall bundle + `resolved`.
- Contract: `agent_recall` returns `status/summary/next_actions/artifacts/data`.
- Protocol/install: the pointer block is inserted idempotently between markers and is removable.

## 10. Open questions (deferred)

- Whether to later add ONE thin per-CLI hook (SessionStart) for a hard guarantee on first recall.
- Tie-breaking when two features share the same `updated_at` (use slug order — minor).
- Whether `agent_recall` should also auto-`context_set` the resolved feature as active for the session
  (decided: it returns `resolved`; the agent calls `context_set` only when switching).
