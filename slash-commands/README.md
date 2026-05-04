# Slash commands

Templates for the 8 user-facing commands that talk to `obsidian-agent-gateway`.
Every command name is prefixed with `obsidian-` so they never collide with other plugins or CLI built-ins.

| Command | Tool | Purpose |
|---|---|---|
| `/obsidian-plan-status` | `agent_boot` | Show the active plan + what is open / in-progress / stale. |
| `/obsidian-plan-create <title>` | `plan_create` | Save the plan the planner just discussed with the user. |
| `/obsidian-plan-list [status]` | `plan_list` | History of plans for this project. |
| `/obsidian-plan-start <task-id>` | `task_update` | Flip a task to `in_progress` and claim it for this session. |
| `/obsidian-plan-done [task-id] [summary]` | `task_complete` | User-confirmed completion. |
| `/obsidian-plan-block <task-id> <reason>` | `task_update` | Block a task. |
| `/obsidian-plan-unblock <task-id>` | `task_update` | Unblock and resume. |
| `/obsidian-plan-note <task-id> <note>` | `task_update` | Append a note without changing status. |

## Installing for Claude Code

Per-user (applies to every project):
```bash
# macOS / Linux
mkdir -p ~/.claude/commands
cp slash-commands/claude-code/*.md ~/.claude/commands/

# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path $HOME\.claude\commands | Out-Null
Copy-Item slash-commands/claude-code/*.md $HOME\.claude\commands\
```

Per-project (only this repo's Claude Code sees them):
```bash
mkdir -p .claude/commands
cp slash-commands/claude-code/*.md .claude/commands/
```

## Installing for Codex CLI / OpenCode

Both CLIs understand a similar "prompt-with-argument" slash mechanism, but path and
front-matter conventions differ. See `codex/README.md` and `opencode/README.md` for
drop-in instructions. The body of each prompt is CLI-agnostic — only the file
location and front-matter keys differ.
