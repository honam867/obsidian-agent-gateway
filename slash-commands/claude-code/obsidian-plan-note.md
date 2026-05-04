---
description: Append a note to a task without changing its status.
argument-hint: <task-id> <note...>
---

Arguments: **$ARGUMENTS**

Parse as `<task-id> <note...>`. Both are required.

Call MCP tool `task_update` on `obsidian-agent-gateway` with:
- `cwd`: current working directory
- `task_id`: the task id
- `note`: the note text

Confirm back to the user in Vietnamese in a single line.
