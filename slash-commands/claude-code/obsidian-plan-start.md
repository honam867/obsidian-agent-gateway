---
description: Start working on a task — flips its status to in_progress in the Obsidian Agent Gateway.
argument-hint: <task-id>
---

The user wants to start task: **$ARGUMENTS**

Steps:
1. If `$ARGUMENTS` is empty, first call `agent_boot` with `cwd=<current working directory>` and ask the user to pick an open task.
2. Call MCP tool `task_update` on the `obsidian-agent-gateway` server with:
   - `cwd`: the current working directory
   - `task_id`: the task id from `$ARGUMENTS`
   - `status`: `"in_progress"`
   - `session`: a short id identifying this CLI session (e.g. `"claude-code-<short-timestamp>"`)
3. If the response contains `session_warning`, surface it and ask the user whether to continue or abort.
4. Fetch the full task detail with `task_get` so you have the acceptance criteria, then begin implementing.
5. Report a one-line confirmation in Vietnamese with the task id + title.
