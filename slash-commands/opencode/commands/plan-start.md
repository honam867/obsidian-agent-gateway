## Role

You are the **coder**. The user wants to start work on a task. Claim it in the Obsidian Agent Gateway, fetch its full body, then implement it.

## Arguments

```
$ARGUMENTS
```

Parse as `<task-id>`. If empty, fall back to the flow in "Ambiguous input" below.

## What to do

### Step 1 — Resolve the task

- If `$ARGUMENTS` contains a task id (pattern like `001-something`), use it directly.
- Otherwise, call `obsidian-agent-gateway.agent_boot` (if you don't already have a fresh response) and present the `open_tasks` list to the user with numbered bullets in Vietnamese. Ask them to pick one. Do NOT guess.

### Step 2 — Flip the status to `in_progress` and claim it

Call `obsidian-agent-gateway.task_update`:
```json
{
  "cwd": "<absolute-cwd>",
  "task_id": "<task-id>",
  "status": "in_progress",
  "session": "opencode-<short-id>",
  "note": "Started by opencode."
}
```

- Reuse the same `session` value you use for `agent_boot` in this OpenCode session.
- If the response contains `session_warning` (non-null), STOP and show the warning to the user verbatim in Vietnamese:
  > ⚠️ Task này đang được session `<current_session>` làm. Vẫn muốn takeover không?
  Wait for explicit confirmation (user typing "có", "yes", "ok"...) before continuing. If they say no, call `task_update` again with `status: "active"` and `session: null` to revert the state, then abort.

### Step 3 — Pull the full task body

Call `obsidian-agent-gateway.task_get`:
```json
{ "cwd": "<absolute-cwd>", "task_id": "<task-id>" }
```

The response's `body` field is the user-written task description (acceptance criteria, hints, reference links, etc.). Read it carefully.

### Step 4 — Confirm to the user in one line

```
✅ Đang làm task `<task-id>` — <title>.
   Acceptance tóm tắt: <1-line paraphrase from body>
   Bắt đầu code.
```

### Step 5 — Implement

Proceed with the actual coding work using OpenCode's normal dev tools (edit, bash, read, write). Respect the project's CLAUDE.md / AGENTS.md / coding standards.

When you finish a logical chunk and want to leave a trace without closing the task, call `/obsidian-plan-note <task-id> <note>`.

## Don't

- Do not mark the task `done` yourself. The user does that via `/obsidian-plan-done`.
- Do not claim multiple tasks in parallel — OpenCode sessions are single-focus.
- Do not skip Step 3 (`task_get`). The acceptance criteria in the body matter.
- Do not call `agent_boot` again if you already have a response younger than 5 minutes.

## Ambiguous input

If `$ARGUMENTS` is empty or ambiguous:
1. Call `agent_boot`.
2. Show `open_tasks` + `in_progress_tasks` (mine) to the user, numbered.
3. Ask them to type the task id or the number.

## Error handling

- "Task not found" → user probably mistyped; offer the open_tasks list again.
- "No active plan" → tell the user to ask Claude Code to create one.
- "Stale write" → call `task_get` to refetch, then retry once with the fresh `version`.

Proceed.
