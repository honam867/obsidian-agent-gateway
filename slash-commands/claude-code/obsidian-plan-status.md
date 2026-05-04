---
description: Show the active plan and open tasks for the current project via the Obsidian Agent Gateway.
---

Call the MCP tool `agent_boot` on the `obsidian-agent-gateway` server with:
- `cwd`: the current working directory (absolute path)
- `agent`: `{ cli: "claude-code", role: "planner" }`

Then summarize the response for the user in Vietnamese:
- Project name & path
- Active plan title (or a note that there is no active plan)
- Open tasks (with id + title)
- In-progress tasks (with id + title + how long they have been running)
- Stale tasks warning if any
- Any hints returned by the tool

Keep the summary concise — bullet lists are fine. Do not call other MCP tools unless the user asks.
