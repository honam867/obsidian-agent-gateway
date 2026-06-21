# Design — Agent Gateway Self-Learn Engine

- Status: draft (awaiting user review)
- Created: 2026-06-21
- Repo: `obsidian-agent-gateway`
- Builds on: Plan 1 (scope foundation) + Plan B (memory tiers) + auto-recall — all merged.

## 1. Problem

The gateway already self-evolves at the GLOBAL `instinct` level (an agent working-method that
recurs gets reinforced, e.g. "use forward-slash node paths"). But the user's deeper ask is missing:

- **Per-repo learning, not global.** A bug or a reusable method/pattern/business-rule belongs to a
  specific repo's domain — it must NOT be stored globally.
- **Reusable patterns ("do it exactly the same next time").** When a method/pattern/business-logic is
  worth reusing, the agent should let the user MENTION it, OR auto-detect repetition, OR proactively
  ASK "this recurs a lot — save it so we don't re-describe it from scratch?".
- **Skip known errors.** When the agent runs something (e.g. a shell script), hits an error, and finds
  a workaround, next time the same situation should SKIP straight to the known fix instead of retrying.
- A deep, long-term learning loop — proactive and context-driven, NOT rigid/hardcoded.

## 2. Goals / Non-goals

**Goals**
- Two new per-repo tiers: `project-lessons` (bug/incident: symptom→cause→fix) and `playbook`
  (reusable procedure/pattern/business-rule), each with confidence + reinforcement.
- A proactive learning loop (hybrid): the server counts repetition and nudges; the agent, taught by
  rich tool descriptions + the protocol, proactively asks the user at the right moment.
- Recall loads a repo's lessons + playbooks at session start so the agent skips known errors and
  follows known patterns without being re-told.

**Non-goals (deferred)**
- Automatic observation of "user habits" (a user-behavior profile) — separate effort.
- Semantic/vector retrieval. Same just-in-time, structure+grep approach as the rest of the gateway.
- Per-CLI hooks. Proactivity is instruction-driven + server-nudged (soft, portable).
- OpenCode/Codex protocol install (tracked separately).

**Accepted trade-off:** proactivity is "soft" — the agent acts because tool descriptions/protocol
teach it and the server surfaces a concrete repetition signal. Strong models follow this reliably.

## 3. Decisions (locked in brainstorming)
- Proactive mechanism = **hybrid (c)**: server counts `observations` and returns a nudge in
  `next_actions`; tool descriptions + protocol teach the agent to act on it / on user mentions.
- Save policy = **(b)**: AUTO-SAVE the cheap learnings (`knowledge`, `project-lessons` after a fix,
  `instinct`); ASK FIRST for the high-commitment ones (`playbook`, and `memory_promote` to global).
- Scope = **per-repo** for `lessons` and `playbooks`. (`instinct` stays global, `knowledge` per-repo.)
  This supersedes the earlier memory-layer spec's "lessons per-feature / playbook global".
- Proactive-ask threshold default = **observations ≥ 2** (configurable).

## 4. Tier model

| Tier | Stores | Scope | Save policy | Confidence |
|---|---|---|---|---|
| `knowledge` *(exists)* | static codebase facts | repo | auto | — |
| `project-lessons` *(new)* | bug/incident: symptom→cause→fix | **repo** | auto (after a fix) | ✅ |
| `playbook` *(new)* | reusable procedure/pattern/business-rule ("do it the same") | **repo** | **ask first** | ✅ + `uses` |
| `instinct` *(exists)* | the AGENT's cross-repo working method | global | auto | ✅ |

Boundary: a **repo-specific** error/pattern → `project-lessons`/`playbook`. A **cross-repo agent
working-method** (how the agent itself should operate) → `instinct`.

## 5. Vault layout (additions)

```
repos/<repo>/
  knowledge/<area>.md     # exists
  lessons/<slug>.md       # NEW
  playbooks/<slug>.md     # NEW
```

## 6. Data shapes (frontmatter)

**`repos/<repo>/lessons/<slug>.md`** — body = `## Symptom / ## Cause / ## Fix`
```yaml
id: cash-remap-null-account
repo: cozrum-server
status: fixed            # fixed | open
confidence: 0.5          # reinforced on re-save: min(1, c + (1-c)*0.5)
observations: 1
last_reinforced_at: <iso>
created_at: <iso>
source_paths: ["src/..."]
tags: [cash, remap]
```

**`repos/<repo>/playbooks/<slug>.md`** — body = `## When to use / ## Steps / ## Notes`
```yaml
id: run-cozrum-script-safely
repo: cozrum-server
title: "Run a cozrum-server script safely"
confidence: 0.5
observations: 1
uses: 0
last_reinforced_at: <iso>
created_at: <iso>
tags: [scripts, db-safety]
```

Confidence/reinforce reuses the existing instinct math (start 0.5; re-save → `min(1, c+(1-c)*0.5)`;
`created_at` preserved; `observations` +1).

## 7. Tools

All return the observation contract `{ status, summary, next_actions, artifacts, data? }`.

**Write**
- `lesson_save(repo, slug, symptom, cause, fix, source_paths?, tags?)` — upsert; re-save reinforces.
  AUTO (the agent calls it after fixing a repo bug). When the resulting `observations ≥ threshold`,
  the response `next_actions` includes a nudge: *"recurred N× — consider asking the user to save a
  playbook / promote to a global instinct."*
- `playbook_save(repo, slug, title, steps, tags?)` — upsert; re-save reinforces + bumps `uses`.
  ASK-FIRST (the agent confirms with the user before calling it).
- `memory_promote(repo, lesson_slug, to: "instinct")` — turn a recurring repo lesson into a global
  instinct. ASK-FIRST.

**Read**
- `lesson_get(repo, slug)` / `lesson_list(repo)` (pointers, sorted by confidence).
- `playbook_get(repo, slug)` / `playbook_list(repo)` (pointers, sorted by confidence).

## 8. Proactive engine (hybrid)

1. **Count:** every `lesson_save` / `playbook_save` re-save increments `observations` on that slug
   (the repetition signal already exists via the reinforce model).
2. **Nudge:** when `observations ≥ threshold` (default 2), the tool's `next_actions` carries an
   explicit suggestion (e.g. "this lesson recurred 2× — ask the user to capture it as a playbook").
3. **Teach:** rich tool descriptions + the protocol tell the agent to (a) act on that nudge by asking
   the user, and (b) proactively offer to save when the user *mentions* a reusable pattern — even
   before the counter fires.
4. The threshold is read from config (`AGENT_GATEWAY_LEARN_THRESHOLD`, default 2).

## 9. Recall integration (skip known errors / follow known patterns)

- `RecallBundle` gains `lessons: LessonPointer[]` and `playbooks: PlaybookPointer[]`.
- `recall(feature)` and `agentRecall(cwd)` load, for each repo in scope, the top lessons + top
  playbooks (by confidence, capped). So at session start the agent already holds: "error X here →
  fix is Y" and "to do Z here → these steps" — and skips re-discovery.
- The protocol instructs the agent to consult loaded lessons/playbooks BEFORE acting.

## 10. Protocol + install additions

`memory-protocol.md` (and the mirrored block in `~/.claude/CLAUDE.md`) gain a SELF-LEARN section:
- After fixing a repo bug → `lesson_save` (auto).
- When a pattern recurs (you see a nudge) or the user mentions a reusable method → ASK, then
  `playbook_save`.
- A repo lesson that recurs across repos → ASK, then `memory_promote` to instinct.
- At session start, read the loaded lessons/playbooks and apply them (skip known errors) before acting.

## 11. Error handling
- Unknown repo on a read → return empty list (like `listKnowledge`).
- Re-save of an existing slug reinforces rather than duplicating.
- Nudges never block — they are advisory `next_actions` only.

## 12. Testing
- Unit: lesson/playbook save + reinforce (confidence 0.5→0.75, `created_at` preserved, `observations`/`uses`);
  list sorted by confidence; unknown-repo → []; nudge appears in `next_actions` at threshold.
- Integration: `agentRecall`/`recall` include repo lessons + playbooks; `memory_promote` creates a
  global instinct from a repo lesson.
- Contract: every new tool returns `status/summary/next_actions/artifacts`.

## 13. Open questions (deferred)
- Tuning the threshold and a decay path for stale lessons.
- Whether `uses` should auto-increment when recall surfaces a playbook (needs an explicit "I used
  this" signal) — left manual for now.
