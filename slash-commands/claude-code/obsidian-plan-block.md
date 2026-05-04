---
description: Mark a task as blocked with a reason.
argument-hint: <task-id> <reason...>
---

The user wants to block a task. Arguments: **$ARGUMENTS**

Parse as `<task-id> <reason...>`. Both are required — if either is missing, ask the user to provide them; do not guess.

Then call MCP tool `task_update` on `obsidian-agent-gateway` with:
- `cwd`: current working directory
- `task_id`: the task id
- `status`: `"blocked"`
- `block_reason`: the reason string
- `note`: the same reason, so it is also appended to the task notes

Confirm back to the user in Vietnamese: task id + title + reason.
