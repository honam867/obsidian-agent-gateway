---
description: Unblock a task and flip it back to in_progress.
argument-hint: <task-id>
---

Arguments: **$ARGUMENTS**

Call MCP tool `task_update` on `obsidian-agent-gateway` with:
- `cwd`: current working directory
- `task_id`: `$ARGUMENTS`
- `status`: `"in_progress"`
- `note`: `"Unblocked — resuming work."`

If `$ARGUMENTS` is empty, call `agent_boot` first and ask the user which blocked task to unblock.

Confirm back in Vietnamese: task id + title.
