---
description: Mark a task as done in the Obsidian Agent Gateway. Requires user confirmation of the task id.
argument-hint: [task-id] [summary...]
---

The user is confirming completion of a task. Arguments: **$ARGUMENTS**

Parse `$ARGUMENTS` as `<task-id> <summary...>`. If no task id is provided:
1. Call `agent_boot` with `cwd=<current working directory>`.
2. If exactly one task is `in_progress`, use that task id and ask the user to confirm.
3. Otherwise, list the in-progress tasks and ask the user which one to mark done.

When the task id is resolved:
- Call MCP tool `task_complete` on `obsidian-agent-gateway` with:
  - `cwd`: the current working directory
  - `task_id`: the resolved task id
  - `summary`: the summary (if provided), otherwise a short summary of what was delivered in this session
- Report the result to the user in Vietnamese (task id + title + timestamp).

Do NOT mark a task done without explicit user intent. This slash command IS that intent, so proceed once the task id is unambiguous.
