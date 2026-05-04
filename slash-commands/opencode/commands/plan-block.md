## Role

You are the **coder**. The user hit a blocker — an external dependency, a design question, a failing service, whatever — and wants to flag the task as `blocked` with a reason so the planner (and the user themselves tomorrow) can see why.

## Arguments

```
$ARGUMENTS
```

Parse as `<task-id> <reason...>`. **Both are REQUIRED.** Do not guess either.

## Resolution rules

- If the first token matches `^\d{3}-[a-z0-9-]+$`, treat it as the task id and the rest as the reason.
- If the first token is missing, or looks like English/Vietnamese prose instead of a task id, STOP and ask the user:
  > Bạn chưa đưa task id. Task nào đang bị block?
- If the reason is missing or shorter than 5 characters, ask:
  > Lý do block cần chi tiết hơn. Bạn mô tả là gì đang chặn?
- Do not substitute a generic reason like "blocked" or "waiting". The reason is what the planner will read.

## What to do

### Step 1 — Block the task

Call `obsidian-agent-gateway.task_update`:
```json
{
  "cwd": "<absolute-cwd>",
  "task_id": "<task-id>",
  "status": "blocked",
  "block_reason": "<reason>",
  "note": "<reason>",
  "session": "opencode-<short-id>"
}
```

- Pass the reason in both `block_reason` (frontmatter field) and `note` (appended to task body) so it's visible both in search and inline.

### Step 2 — Suggest next steps

After confirming the block, suggest to the user in Vietnamese:
- If there's another task with `status: "active"` that doesn't depend on this one → offer to start it: "Gợi ý: task `<other-id>` không phụ thuộc task này, muốn chuyển sang làm không?"
- If no other task is available → suggest they run `/obsidian-plan-status` later to see if it unblocks.

### Step 3 — Confirm

```
⛔ Task `<task-id>` — <title> đã đánh dấu **blocked**.
   Lý do: <reason>
   (Ghi chú đã thêm vào task notes.)
```

## Don't

- Do not call `task_update` with `status: "active"` or `"in_progress"` in this command — use `/obsidian-plan-unblock` for that.
- Do not guess a reason based on your session context, even if you know what's happening. Ask the user to articulate it themselves — the vault record must reflect what THEY observed.
- Do not block a task that is already `done`. If the user asks, explain the state and suggest reopening via `/obsidian-plan-start`.

Proceed.
