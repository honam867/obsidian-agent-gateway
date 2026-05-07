# PLAN.md — design notes for obsidian-agent-gateway

This file is the long-form design record for the MCP server. It is **not** where day-to-day
tasks live — those live in the Obsidian vault under `projects/obsidian-agent-gateway/plans/`.

## Purpose

A **middleware gateway** so multiple CLI coding agents can work on the same project without
stepping on each other. The gateway:
- Uses an Obsidian vault as the single source of truth (human-readable markdown).
- Exposes a compact MCP surface so agents can read and mutate state without knowing
  anything about the file layout.
- Is opinionated about one thing only: there is exactly **one active plan per project at a time**.

## Core constraints

| Constraint | Rationale |
|---|---|
| Vault path is fixed per user | User reads the vault in Obsidian; moving paths breaks muscle memory. |
| Plan IDs are human-readable (`YYYY-MM-DD-slug`) | User greps by date. |
| No review state in the state machine | User wants flexibility — review happens out-of-band. |
| One MCP instance, multi-project | Simpler config and consistent graph-link rendering. |
| No lease / lock | Complexity isn't worth it for local workflows; soft warnings are enough. |
| No LLM calls inside the MCP | Deterministic, cheap, offline-friendly. |

## Non-goals

- Web UI, dashboards, analytics.
- Cross-machine sync (use Obsidian Sync / git if needed).
- Automatic dependency ordering between tasks.
- Automatic "who should do this" routing between CLIs.

## Surface area

| Tool | Used by | Frequency |
|---|---|---|
| `agent_boot` | every CLI | once per session |
| `plan_create` | planner | rare (new effort) |
| `plan_revise` | planner | rare |
| `plan_archive` | planner | rare |
| `plan_list` | any | occasional |
| `task_add` | planner / maintainer | scope expands mid-plan |
| `task_edit` | planner / maintainer | task wording or metadata changes |
| `task_delete` | planner / maintainer | rare cleanup of unwanted tasks |
| `task_update` | coder | per task-status change |
| `task_complete` | coder (via user slash) | per task completion |
| `task_get` | coder | when acceptance body is needed |
| `task_list` | any | inspect all tasks for one plan |
| `review_submit` | reviewer | attach review feedback |
| `project_relink` | maintainer | rebuild graph links / migrate legacy note names |

## State machine

```
draft ─▶ active ─▶ in_progress ─▶ done
           │            │            ▲
           │            ▼            │
           └───────▶ blocked ────────┘
```

## Auto-breakdown logic

See `src/utils/breakdown.ts`. Deterministic, heading-based. Thresholds are configurable.

- `lines < small (800)` → single task.
- `small ≤ lines < large (2000)` → split by `##` headings.
- `lines ≥ large (2000)` → split by `##` then subdivide by `###` within each.
- Fallback: `## Task:` marker.
- Last-resort: keep as single task with a warning.

## Edge cases (tracked; answered in the README §7 too)

1. New project auto-registered from `cwd`.
2. Directory-name collision → hard error, no silent hashing.
3. Two CLIs on the same task → `session_warning` in response, no hard block.
4. User edits markdown in Obsidian → optimistic concurrency via `version`; if the caller
   passes `expected_version`, a stale write is rejected.
5. Long plans → auto-breakdown.
6. Active-plan conflict → new plan archives the old one.
7. CLI crash → task stays `in_progress`; stale bucket surfaces it.
8. Audit log growth → monthly rotation.

## Future (not v0.1)

- Obsidian plugin for inline action buttons inside task notes.
- SQLite side-index for faster multi-project queries.
- Cross-project plans (one plan spanning two repos).
- Secret-scrubbing middleware on plan/task writes.
- A real `plan_revise` that diffs content and suggests which tasks to re-generate.
