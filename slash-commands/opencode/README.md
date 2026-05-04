# OpenCode slash command adapter (dev-oriented)

OpenCode is the coder seat — so the slash commands here are longer and more explicit
than the Claude Code versions. They spell out:
- the exact MCP tool name (`obsidian-agent-gateway.<tool>`) and JSON arguments
- resolution rules for ambiguous arguments
- error-handling cases (stale write, slug conflict, MCP unreachable)
- output format in Vietnamese
- what the command must NOT do

## Files

- `commands/plan-status.md`
- `commands/plan-create.md`
- `commands/plan-list.md`
- `commands/plan-start.md`
- `commands/plan-done.md`
- `commands/plan-block.md`
- `commands/plan-unblock.md`
- `commands/plan-note.md`

## Install

### 1. Drop the templates into OpenCode's config — **not** under `commands/`

> **Important.** OpenCode auto-registers any `.md` file inside `~/.config/opencode/commands/<subdir>/`
> as a slash command named `/<subdir>/<filename>`. If you put the templates there, you will end
> up with duplicate commands (both the namespaced auto-discovered one and the explicitly
> registered one from the config block below). Put the templates somewhere else.

```bash
# macOS / Linux
mkdir -p ~/.config/opencode/obsidian-gateway
cp slash-commands/opencode/commands/*.md ~/.config/opencode/obsidian-gateway/
```

```powershell
# Windows (PowerShell)
$dest = Join-Path $HOME '.config/opencode/obsidian-gateway'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item slash-commands/opencode/commands/*.md $dest
```

### 2. Register the MCP server + 8 commands in `~/.config/opencode/opencode.json`

Under the top-level `mcp` block, add:

```json
"obsidian-agent-gateway": {
  "type": "local",
  "enabled": true,
  "command": ["node", "D:/working/obsidian-agent-gateway/dist/src/index.js"],
  "environment": {
    "AGENT_GATEWAY_VAULT": "D:/working/AgentGateway",
    "AGENT_GATEWAY_TZ": "Asia/Ho_Chi_Minh"
  }
}
```

Under the top-level `command` block, add:

```json
"obsidian-plan-status": {
  "description": "[Obsidian Agent Gateway] Briefing plan + tasks hiện tại. Read-only.",
  "template": "{file:obsidian-gateway/plan-status.md}\n\n$ARGUMENTS"
},
"obsidian-plan-create": {
  "description": "[Obsidian Agent Gateway] Tạo plan mới (archive plan cũ).",
  "template": "{file:obsidian-gateway/plan-create.md}\n\n$ARGUMENTS"
},
"obsidian-plan-list": {
  "description": "[Obsidian Agent Gateway] Liệt kê plans.",
  "template": "{file:obsidian-gateway/plan-list.md}\n\n$ARGUMENTS"
},
"obsidian-plan-start": {
  "description": "[Obsidian Agent Gateway] Bắt đầu 1 task.",
  "template": "{file:obsidian-gateway/plan-start.md}\n\n$ARGUMENTS"
},
"obsidian-plan-done": {
  "description": "[Obsidian Agent Gateway] User xác nhận task xong.",
  "template": "{file:obsidian-gateway/plan-done.md}\n\n$ARGUMENTS"
},
"obsidian-plan-block": {
  "description": "[Obsidian Agent Gateway] Block task với lý do.",
  "template": "{file:obsidian-gateway/plan-block.md}\n\n$ARGUMENTS"
},
"obsidian-plan-unblock": {
  "description": "[Obsidian Agent Gateway] Unblock task.",
  "template": "{file:obsidian-gateway/plan-unblock.md}\n\n$ARGUMENTS"
},
"obsidian-plan-note": {
  "description": "[Obsidian Agent Gateway] Thêm note vào task.",
  "template": "{file:obsidian-gateway/plan-note.md}\n\n$ARGUMENTS"
}
```

### 3. Permissions

If your `opencode.json` has `"permission": { "mcp_*": "ask" }`, OpenCode will prompt
before each MCP call the first time. Approve once per tool and it will remember.

To allow without prompting:
```json
"permission": {
  "mcp_obsidian-agent-gateway_*": "allow"
}
```

### 4. Restart OpenCode

Fully quit and relaunch — OpenCode caches the MCP tool list at startup. After restart,
`/obsidian-plan-status` should show up in the slash menu.

## Verifying

From inside OpenCode in any project directory:

```
/obsidian-plan-status
```

You should see a briefing or "Chưa có plan nào active" if the project has no plan yet.

Then, from Claude Code in the same project:
```
/obsidian-plan-create Sample plan
```

Back in OpenCode:
```
/obsidian-plan-status
```

The plan should now appear. That's the end-to-end handoff working.

## Why these templates are longer than Claude Code's

- OpenCode sessions do real implementation work — the agent is mid-task when slash
  commands fire, so the templates include explicit "don't do X" guardrails to keep
  the agent focused.
- OpenCode's `$ARGUMENTS` is passed raw; the templates include parsing rules so the
  agent doesn't hallucinate a task id.
- Dev workflows require sanity checks (`/obsidian-plan-done` runs tests / typecheck
  before marking a task done).
