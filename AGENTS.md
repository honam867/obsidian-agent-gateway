# AGENTS.md — guidance for any non-Claude coding agent

This file tells an agent (Codex CLI, OpenCode, Cursor, …) **how to behave inside a project that
uses `obsidian-agent-gateway` as its coordination layer**. Follow this whenever a user asks you
to "work on a task", "check what's open", "pick up from where we left off", etc.

> **TL;DR** — call `agent_boot` once at the start of every session, act on what it returns, and
> do not touch tasks the user has not explicitly referenced.

---

## 1. Your role

- The user collaborates with **multiple CLIs** via the same Obsidian vault.
- The **planner** role (usually Claude Code) creates the plan and tasks.
- **Your job** is to be a competent **coder**. You may also act as a reviewer if the user asks.
- You do NOT decide when a task is "done" — the user does, via `/obsidian-plan-done`. Do not
  call `task_complete` on your own initiative.

---

## 2. First action in every session

Always call the MCP tool `agent_boot` on the `obsidian-agent-gateway` server, passing:
- `cwd`: the absolute working directory
- `agent`: `{ cli: "<your-cli-name>", session: "<stable-session-id>", role: "coder" }`

Cache the response for ~5 minutes — the `cache_until` field tells you when it expires. Do not
call `agent_boot` again within that window unless the user triggers `/obsidian-plan-status` or
you observe a write to the vault.

The response contains everything you need:
- `project` — slug, path, name
- `active_plan` — id, title, task counts
- `open_tasks`, `in_progress_tasks`, `stale_tasks`, `my_active_tasks`
- `recent_activity` — today's updates
- `hints` — a short list of one-liners meant to be shown to the user

If `active_plan` is `null`, tell the user there's no active plan and suggest they ask the
planner to create one.

---

## 3. Tool-calling rules

| Rule | Why |
|---|---|
| Call **`agent_boot` exactly once per session** at start (or on explicit `/obsidian-plan-status`). | Minimises round-trips; the response is a superset of what the other read tools return. |
| Call `task_get` **only** when you need the full body (acceptance criteria, notes) of a specific task that wasn't in the boot summary. | Avoid duplicate reads — the boot response already has frontmatter. |
| Call `task_update` when the user explicitly tells you to start / block / unblock / note. | Never mutate state based on vibes. |
| Call `task_complete` **only via `/obsidian-plan-done`**. | The user's slash command is their explicit intent. |
| Call `plan_create` only when the user is the planner and just finished discussing a plan. | Creating a plan archives the previous active one — don't do it accidentally. |

If a tool returns `session_warning`, surface it to the user verbatim and ask whether to proceed
with the takeover.

---

## 4. When the user asks something vague

| User says | You do |
|---|---|
| "What are we working on?" | Summarise `agent_boot` — active plan + open & in-progress tasks. |
| "Continue." | Look at `in_progress_tasks`. If exactly one is yours, resume it. Otherwise ask which. |
| "Check if anything's stale." | Look at `stale_tasks` in the boot response. |
| "Done with this." | Do NOT auto-call `task_complete`. Tell the user to run `/obsidian-plan-done`. |
| "Start task 003." | Run `/obsidian-plan-start 003-...` flow: `task_update` to `in_progress`, then `task_get` for the body. |

---

## 5. What NOT to do

- Do not call `agent_boot` multiple times per session.
- Do not mutate tasks that the user didn't reference. If a task is already `in_progress` by
  another session, read it but don't change it without user confirmation.
- Do not write files directly to the vault. All changes go through MCP tools.
- Do not invent task ids. If the user is ambiguous, call `agent_boot` and ask them to pick.
- Do not call `plan_revise` or `plan_archive` unless the user asks explicitly — those are
  disruptive to other CLIs.
- Do not mark a task `done` just because tests pass. The user decides.

---

## 6. Slash commands the user will type

The user's slash commands map to MCP tools 1:1:

- `/obsidian-plan-status` → `agent_boot`
- `/obsidian-plan-create <title>` → `plan_create`
- `/obsidian-plan-list [status]` → `plan_list`
- `/obsidian-plan-start <task-id>` → `task_update(status=in_progress)`
- `/obsidian-plan-done [task-id] [summary]` → `task_complete`
- `/obsidian-plan-block <task-id> <reason>` → `task_update(status=blocked)`
- `/obsidian-plan-unblock <task-id>` → `task_update(status=in_progress)`
- `/obsidian-plan-note <task-id> <note>` → `task_update(note=…)`

If these aren't installed for your CLI, `slash-commands/` has install instructions.

---

## 7. Concurrency model — what to assume

- There is **no lease, no lock**. Multiple CLIs can read / write simultaneously.
- Writes are **atomic at the file level** (tmp + rename).
- Every task has a `version` field (optimistic concurrency). Pass `expected_version` on
  `task_update` if you want to detect a clobber.
- The `session` field in task frontmatter is a hint, not a mutex. If you see a different
  session, warn the user.

---

## 8. Audit trail

Every mutation writes an event to `sessions/audit-YYYY-MM.jsonl` inside the plan folder.
If the user asks "who did X and when", this is where to look (or they can grep in Obsidian).
