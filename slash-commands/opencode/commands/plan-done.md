## Role

You are the **coder**. The user is confirming that a task is finished to their satisfaction. This command is the user's explicit "mark done" signal — proceed without asking for further confirmation, BUT do a final sanity check before firing the MCP call.

## Arguments

```
$ARGUMENTS
```

Parse as `<task-id> <summary...>`. Both may be omitted — see "Resolution rules" below.

## Resolution rules

**Task id:**
1. If the first token of `$ARGUMENTS` matches a task-id pattern (`^\d{3}-[a-z0-9-]+$`), use it.
2. Otherwise, consult the cached `agent_boot` response:
   - If exactly ONE task is `in_progress`, use that task id and mention it in your confirmation: "Task đang làm: `<id>` — <title>. Mark done?"
   - If MORE than one is `in_progress`, list them and ask the user to pick.
   - If NONE is `in_progress`, ask the user for an explicit task id — do not default to any.

**Summary:**
- If remaining `$ARGUMENTS` after the task id is non-empty, use it as the `summary`.
- Otherwise, generate a concise 1-line summary in Vietnamese from what you (OpenCode) delivered in this session — mention the files you touched or the feature you added. Do NOT pad with "I successfully implemented...". Example: `"Migration 0004_add_users.sql và tests liên quan; tests pass."`

## What to do

### Step 1 — Sanity check (fast)

Before calling `task_complete`, verify quickly:
- Tests (if any) are green. If you ran tests recently and they passed, good. If you haven't, run them with the project's `test` command (npm test, pytest, go test, …) — but only if the command takes < 30s. Otherwise skip.
- No TypeScript / lint errors introduced in the session. If the project has a `typecheck` script, run it.
- Git working tree is not pristine (the change has been saved to disk).

If any of the above fails, STOP and tell the user in Vietnamese what's wrong. Do not mark the task done.

### Step 2 — Mark done

Call `obsidian-agent-gateway.task_complete`:
```json
{
  "cwd": "<absolute-cwd>",
  "task_id": "<resolved-task-id>",
  "summary": "<summary>",
  "session": "opencode-<short-id>"
}
```

### Step 3 — Report in Vietnamese

```
✅ Đã đánh dấu `<task-id>` — <title> là **done**.
   Tóm tắt: <summary>
   Thời điểm: <completed_at>
   Plan: <plan_id>
   Còn lại: <count of active + in_progress tasks after this one>
```

If the plan is now entirely done (no `active` / `in_progress` / `blocked` tasks), add:
> 🎉 Plan `<plan_id>` đã xong toàn bộ. Cân nhắc chạy `/obsidian-plan-list active` để kiểm tra và `/obsidian-plan-create` cho đợt kế tiếp.

## Don't

- Do not mark any OTHER task done, even if it looks related.
- Do not call `task_complete` without a task id — if the id is ambiguous, stop and ask.
- Do not skip the sanity check when the project has a fast test / typecheck command.
- Do not translate the `summary` — keep it in whatever language the user used if they supplied one; otherwise Vietnamese.

## Error handling

- "Task not found" → ask the user to double-check the id with `/obsidian-plan-status`.
- "Invalid task transition" → the task is probably already `done`. Tell the user; do not retry.
- MCP unreachable → do NOT fabricate success. Report the error.

Proceed.
