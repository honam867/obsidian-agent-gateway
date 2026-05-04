---
description: Submit a review for a task in the Obsidian Agent Gateway. Writes verdict and feedback directly into the task file.
argument-hint: <task-id> <approved|changes_requested> [feedback...]
---

The user wants to submit a review. Arguments: **$ARGUMENTS**

Parse `$ARGUMENTS` as `<task-id> <verdict> <feedback...>`:
- `task-id`: the task to review (e.g. `001-schema`).
- `verdict`: either `approved` or `changes_requested`.
- `feedback`: the rest of the arguments joined as the review body. If omitted, ask the user to provide feedback inline.

When all fields are resolved:
- Call MCP tool `review_submit` on `obsidian-agent-gateway` with:
  - `cwd`: the current working directory
  - `task_id`: the resolved task id
  - `verdict`: approved or changes_requested
  - `feedback`: the full feedback text (markdown supported)
  - `session`: the current session id if available
- Report the result to the user in Vietnamese: task id + verdict + confirmation that the coder can now read it via `task_get`.

If `verdict` is `approved`, also suggest the user run `/obsidian-plan-done <task-id>` to close the task.
If `verdict` is `changes_requested`, remind the user that the coder will see the task in the `needs_revision` bucket on their next `agent_boot`.
