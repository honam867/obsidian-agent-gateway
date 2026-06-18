# Design — Agent Gateway Memory/Knowledge Layer

- Status: draft (awaiting user review)
- Created: 2026-06-19
- Repo: `obsidian-agent-gateway`
- Sub-project: #1 of 4 (Memory/Knowledge layer)

## 1. Problem

A coding agent (OpenCode / Claude Code / Codex …) loses everything between sessions.
Concrete pain: a large module (`misa-payout` inside `cozrum-server`) worked across 4
separate sessions forces the agent to re-read the codebase every time. We want the agent
to start a session already knowing: what it was doing last, where it stopped, how to
run/test the project, and any hard-won lessons — without re-reading code. It must also
accumulate knowledge over time and scale across many projects.

The user always works from the workspace root `D:/working` (which contains many repos) and
frequently edits across repos at once (e.g. `cozrum-server` + `cozrum-cms` for one feature).

## 2. Goals / Non-goals

**Goals**

- Persistent, cross-session memory keyed for a multi-repo workspace.
- Five memory tiers (working / knowledge / playbook / project-lessons / instincts).
- Just-in-time retrieval so the agent never has to swallow a whole codebase.
- Self-evolving global "instincts" (the agent improves how it works over time).
- Reuse the existing plan/task machinery as structured working-memory.

**Non-goals (separate future specs)**

- Auto-triggering (hook-style "on compact, write progress") — requires per-CLI hooks/plugins, not pure MCP. → spec #2.
- Advanced multi-agent orchestration / work distribution. → spec #4.
- Semantic vector search. The vault uses structure + naming + links + full-text grep
  (just-in-time), not embeddings. If semantic search is needed later it is an add-on.

## 3. Scope model

```
Workspace  = D:/working (root)              # physical location only, NOT a scope key
Repo       = each git-root under workspace  # cozrum-server, cozrum-cms, …  (auto-discovered)
                                            # owns codebase knowledge
Feature    = free-form label (misa-payout)  # PRIMARY scope unit, may span multiple repos
                                            # owns working memory + project-lessons + plans/tasks
Global     = cross-project, cross-CLI        # playbooks + instincts (self-evolving)
```

`cwd` is no longer a scope key (it is always the root). Scope is resolved via an
**active-context pointer** (see §6).

## 4. Memory tiers

| Tier            | Type         | Stores                                                             | Scope       | Lifecycle                 |
| --------------- | ------------ | ------------------------------------------------------------------ | ----------- | ------------------------- |
| working         | episodic     | "what I'm doing now, where I stopped, next step"                   | feature     | archived when task done   |
| knowledge       | semantic     | codebase facts: architecture, conventions, gotchas, run/test cmds  | repo + path | updated when code changes |
| playbook        | procedural   | repeatable how-to (deploy, add endpoint, run migration)            | global      | durable                   |
| project-lessons | —            | a bug/incident of THIS feature: symptom→cause→fix                  | feature     | durable per feature       |
| instincts       | self-improve | how the AGENT should work (friction → workaround), with confidence | global      | durable, evolves          |

Boundary rules (so the agent always knows where to write):

- `knowledge` = _describes state_ ("what it is").
- `playbook` = _proactive procedure_ ("to do X, follow these steps").
- `project-lessons` = _reaction to an incident in a project_ ("when error Y happens, fix is …").
- `instincts` = _reaction about the agent's own behaviour_ ("querying like this fails, do it that way").
- A `project-lesson` that recurs across ≥ N features can be **promoted** to a `playbook` or `instinct`.

## 5. Vault layout

Clean-slate (old `projects/` data is deleted by the user; no legacy readers, no migration).

```
AgentGateway/
  _index/
    workspace.json              # repo + feature registry
  global/
    playbooks/<slug>.md
    instincts/<slug>.md
  repos/
    <repo>/
      _repo.md                  # run/test cmds, architecture summary, entry chain
      knowledge/<area>.md
  features/
    <feature>/
      _feature.md               # repos[], paths[], status
      working/
        current.md              # "last action, where I stopped, next step" (the 4-session fix)
        sessions/<id>.md        # per-session log (rotated/archived)
      lessons/<slug>.md
      plans/<plan-id>/          # existing plan/task machinery, unchanged
        <plan-id>.md
        tasks/<task-id>.md
```

## 6. Active-context resolution (hybrid — option C)

1. `agent_boot` scans git-roots under the workspace and recent activity, then **suggests** a
   feature + repos.
2. The agent (or user) confirms in one step.
3. The choice is pinned as `{ feature, repos[], session_id }` for the session; every later tool
   reads this pointer — no manual `cwd`/feature threading.
4. `context_set` switches the active feature/repos mid-session.

## 7. Data shapes (frontmatter)

**`_index/workspace.json`**

```json
{
  "repos": {
    "cozrum-server": {
      "slug": "cozrum-server",
      "path": "D:/working/cozrum-server",
      "git_remote": "...",
      "registered_at": "..."
    }
  },
  "features": {
    "misa-payout": {
      "slug": "misa-payout",
      "title": "MISA Payout",
      "repos": ["cozrum-server", "cozrum-cms"],
      "paths": ["cozrum-server/src/.../misa"],
      "status": "active",
      "created_at": "...",
      "updated_at": "..."
    }
  }
}
```

**`features/<f>/working/current.md`**

```yaml
feature: misa-payout
session: opencode-ab12
updated_at: <iso>
active_task: 003-cash-prepare
last_action: "Added blockIds to prepare payload; cash branch still failing on remap"
next_step: "Trace resolveTargetForPayout for cash source"
```

**`repos/<repo>/_repo.md`**

```yaml
slug: cozrum-server
path: D:/working/cozrum-server
git_remote: <opt>
run_cmd: "npm run dev"
test_cmd: "npx jest src/test/<file>.test.js"
updated_at: <iso>
```

**`repos/<repo>/knowledge/<area>.md`**

```yaml
id: misa-payout-prepare
repo: cozrum-server
area: misa-payout
source_paths: ["src/controllers/finance/misa_payout/index.js"]
verified_at: <iso>
stale: false
tags: [misa, payout]
```

**`features/<f>/lessons/<slug>.md`** — body = `## Symptom / ## Cause / ## Fix`

```yaml
id: cash-remap-null-account
feature: misa-payout
status: fixed
source_paths: [...]
created_at: <iso>
tags: [cash, remap]
```

**`global/playbooks/<slug>.md`** — body = ordered steps

```yaml
id: run-cozrum-script-safely
title: "Run a cozrum-server script safely"
scope: global
repos: [cozrum-server]
uses: 5
created_at: <iso>
updated_at: <iso>
tags: [scripts, db-safety]
```

**`global/instincts/<slug>.md`** — body = `## Trigger / ## Action / ## Why`

```yaml
id: forward-slash-node-paths
title: "Use forward-slash paths when running node on Windows"
confidence: 0.8 # 0..1, reinforced/decayed over time
observations: 4 # how many times confirmed
status: active # active | retired
last_reinforced_at: <iso>
created_at: <iso>
tags: [windows, shell]
```

## 8. Read protocol (session startup)

`agent_boot` returns a **minimal bundle**; everything else is fetched on demand:

1. Suggested active-context (feature + repos).
2. `working/current.md` — last action, in-progress task, next step.
3. `_repo.md` for related repos — run/test cmds + architecture summary.
4. **Pointers only** (titles + paths, not full bodies) to: relevant knowledge areas, recent
   lessons, open plans/tasks.
5. Top `instincts` by confidence.

Deeper content is pulled with `memory_get` / `memory_search` only when needed. This is what
removes the "re-read the codebase" cost.

## 9. Write protocol

Trigger → tier:

| Event                                                  | Writes to                | How                               |
| ------------------------------------------------------ | ------------------------ | --------------------------------- |
| End of a step/phase, or before compaction              | `working/current.md`     | overwrite, always                 |
| Discover an architecture/convention/gotcha             | `repos/<repo>/knowledge` | append/update, set `source_paths` |
| Feature bug fixed                                      | `features/<f>/lessons`   | append: symptom→cause→fix         |
| A repeatable procedure is established                  | `global/playbooks`       | append/update                     |
| Lesson about how the agent works (friction→workaround) | `global/instincts`       | append + confidence               |

Cross-cutting rules:

- **Signal vs noise:** only record decisions / gotchas / commands / bug-fixes / overcome
  friction. Never raw tool output or trivial trial-and-error.
- **Confidence + reinforcement (instinct):** repeated/confirmed → raise confidence;
  contradicted → lower or retire. Startup loads only high-confidence instincts.
- **Promotion:** a lesson recurring across ≥ N features is proposed for promotion to
  playbook/instinct.
- **Staleness:** knowledge carries `source_paths` + `verified_at`; when those paths change in
  git, mark `stale: true` so the agent re-verifies before trusting it.
- **Concurrency:** reuse the existing optimistic `version` / `expected_version` guard. Distinct
  features never collide; same-feature writes are version-guarded.

## 10. Tool surface

All tools return the harness observation contract: `status` / `summary` / `next_actions` /
`artifacts`. Save tools are split per tier (not one catch-all) so the agent picks the right
target and observations stay specific.

**Context (1 new + agent_boot):** `context_set(feature, repos[])`.

**Read (3):**

- `agent_boot(cwd?)` → startup bundle (§8), resolves/suggests context.
- `memory_get(kind, id)` → one knowledge/lesson/playbook/instinct entry.
- `memory_search(query, scope?)` → full-text grep across the vault.

**Write (6):**

- `progress_update(feature, last_action, next_step, active_task?)` → `working/current.md`.
- `knowledge_save(repo, area, body, source_paths[])`.
- `lesson_save(feature, slug, symptom, cause, fix, source_paths[])`.
- `playbook_save(slug, title, steps, scope, repos?)`.
- `instinct_save(slug, trigger, action, why)` (also reinforces if it exists, bumping confidence).
- `memory_promote(from_id, to_kind)` → lesson → playbook/instinct.

**Unchanged:** all `plan_*` / `task_*` — they ARE structured working-memory; only the scope key
changes (`project` → `feature`).

## 11. Integration & refactor

`project` (old) ≡ `feature` (new) in role, so plan/task logic is preserved; refactor concentrates
in the **scope layer**. Clean-slate: no backward-compat, no migration.

| File                                                                 | Change                                                                                 | Size                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------ |
| `domain/project.ts` → `domain/feature.ts`                            | Stop deriving slug from cwd; resolve by feature label + active-context                 | core                     |
| `vault/paths.ts`                                                     | Base `projects/<slug>` → `features/<feature>`; add `repos/`, `global/`; drop `legacy*` | medium                   |
| `vault/project-registry.ts` → `feature-registry.ts`                  | Entry: single `path` → `repos[]/paths[]`; add repo registry                            | medium                   |
| `schemas/project.ts` → `schemas/feature.ts`                          | Feature frontmatter with `repos[]`                                                     | small                    |
| `tools/*` (take `cwd`)                                               | Take feature from active-context instead of deriving cwd                               | rename of param plumbing |
| `domain/plan.ts`, `domain/task.ts`, `domain/state-machine.ts`        | rename `slug` → `featureSlug`; logic unchanged                                         | very small               |
| `tools/project-relink.ts`                                            | Rebuild links for the new schema (no legacy migration)                                 | medium                   |
| new: `domain/memory.ts`, `domain/knowledge.ts`, `domain/instinct.ts` | tier read/write logic                                                                  | new                      |
| new: tool files for §10                                              | one file per tool                                                                      | new                      |

## 12. Error handling

- Unknown feature/repo → `status: error`, `next_actions` suggests `context_set` or boot.
- Stale knowledge served → flagged in `summary`, agent re-verifies.
- Version conflict on write → `status: warning` + refetch instruction (existing pattern).
- Missing `current.md` → treated as a fresh feature, not an error.

## 13. Testing

- Unit: scope resolution (root cwd → suggested feature), tier write/read round-trips,
  confidence reinforce/decay, promotion, staleness flagging.
- Integration: full `agent_boot` bundle shape; plan/task under a feature; cross-repo feature
  touching two repos.
- Contract: every tool returns `status/summary/next_actions/artifacts`.

## 14. Open questions (defer to later specs)

- Auto-trigger glue per CLI (OpenCode plugin vs Claude Code hooks) — spec #2.
- Concrete promotion threshold `N` and decay curve for confidence — tune during impl.
- Whether `memory_search` needs an index beyond grep at scale.
