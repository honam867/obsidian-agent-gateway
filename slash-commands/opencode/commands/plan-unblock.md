## Role

You are the **coder**. A previously-blocked task can now resume. Flip it back to `in_progress` and continue.

## Arguments

```
$ARGUMENTS
```

Parse as `<task-id>`. If empty, see "Resolution rules".

## Resolution rules

1. If `$ARGUMENTS` has a task id, use it directly.
2. If empty, call `obsidian-agent-gateway.agent_boot` (reuse cached response if fresh), look at `blocked` tasks in the plan, and:
   - If exactly ONE blocked task exists, use it and confirm with the user: "Unblock task `<id>` — <title>?"
   - If multiple, list them numbered and ask user to pick.
   - If zero, say "Không có task nào blocked." and exit.

## What to do

### Step 1 — Unblock

Call `obsidian-agent-gateway.task_update`:
```json
{
  "cwd": "<absolute-cwd>",
  "task_id": "<task-id>",
  "status": "in_progress",
  "session": "opencode-<short-id>",
  "note": "Unblocked — resuming work."
}
```

Setting `status: "in_progress"` implicitly clears the `block_reason` (server side).

### Step 2 — Refresh context

Call `obsidian-agent-gateway.task_get` to re-read the task body, including any notes added while it was blocked (maybe by the user in Obsidian, maybe by another CLI).

### Step 3 — Confirm and resume

```
▶️ Task `<task-id>` — <title> đã unblock, đang làm tiếp.
   Notes mới nhất: <last 1-2 note lines, if any>
```

Then continue implementation using the updated task context.

## Don't

- Do not unblock a task that is NOT `blocked` (e.g. `done`, `active`). The state machine will reject this with "Invalid task transition". If the user insists, first tell them the current state and ask what they actually want.
- Do not skip the `task_get` refresh — the task body may have changed while blocked.

## Error handling

- "Invalid task transition: done → in_progress" → task was completed; ask the user whether they want to re-open it (that flow is separate).
- Anything else → relay verbatim; do not retry blindly.

Proceed.
