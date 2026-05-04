---
description: List historical plans (active + archived) for the current project.
argument-hint: [status]
---

Arguments: **$ARGUMENTS** (optional status filter: active | archived | draft)

Call MCP tool `plan_list` on `obsidian-agent-gateway` with:
- `cwd`: current working directory
- `status`: the filter from `$ARGUMENTS` if provided

Render a compact list in Vietnamese: plan id, title, status, created_at.
