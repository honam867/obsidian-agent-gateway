# obsidian-agent-gateway

An **MCP server** that turns an Obsidian vault into a **middleware gateway** between multiple CLI
coding agents (Claude Code, Codex CLI, OpenCode, …). One CLI writes a plan, another CLI picks up
tasks from it — every action goes through the same markdown files, so the state is legible to
humans and every agent sees the same picture.

> **Roles in the workflow**
> - **Planner** — usually Claude Code. Discusses with the user, then commits the plan with `/obsidian-plan-create`.
> - **Coder** — any CLI (Codex, OpenCode, or Claude Code itself). Reads the active plan, picks a task, implements it.
> - **Reviewer** — optional. The user reviews manually, then a slash command marks the task done.

---

## 1. How it works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Claude Code │     │ Codex CLI   │     │ OpenCode    │
│ (Planner)   │     │ (Coder)     │     │ (Reviewer)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       └───── MCP (stdio) ─┼────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  MCP Server │   ← 8 tools, state machine, audit log
                    │  (Node.js)  │
                    └──────┬──────┘
                           │ atomic markdown writes
                    ┌──────▼──────┐
                    │  Obsidian   │   ← single source of truth
                    │   Vault     │   ← human-readable, git-friendly
                    └─────────────┘
```

### Vault layout

```
AgentGateway/                      ← the Obsidian vault (default: D:\working\AgentGateway)
├── .obsidian/                     ← auto-created so Obsidian can open the folder directly
├── _index/
│   └── projects.json              ← slug → absolute path mapping
└── projects/
    └── <project-slug>/            ← one folder per registered project
        ├── project.md
        └── plans/
            └── 2026-04-22-auth-refactor/
                ├── plan.md        ← status: draft | active | archived
                ├── tasks/
                │   ├── 001-schema.md
                │   └── 002-middleware.md
                └── sessions/
                    └── audit-2026-04.jsonl   ← rotated monthly
```

### Task state machine

```
draft ─▶ active ─▶ in_progress ─▶ done
           │            │            ▲
           │            ▼            │
           └───────▶ blocked ────────┘
```

No review step is enforced — mark `done` when you (the user) are satisfied.

---

## 2. Install & run

### Prerequisites
- **Node.js ≥ 20**
- **Obsidian** (already installed on your side). Open `D:\working\AgentGateway` as a vault.

### Clone & build

```bash
git clone <this-repo> obsidian-agent-gateway
cd obsidian-agent-gateway
npm install
npm run build
```

### (Optional) Custom vault path

Default is `D:\working\AgentGateway` on Windows (or `~/AgentGateway` elsewhere).
Override with an env var:

```bash
# Windows (cmd)
set AGENT_GATEWAY_VAULT=D:\path\to\YourVault

# Windows (PowerShell)
$env:AGENT_GATEWAY_VAULT = 'D:\path\to\YourVault'

# macOS / Linux
export AGENT_GATEWAY_VAULT=/path/to/YourVault
```

See `.env.example` for all configurable variables.

---

## 3. Register the MCP server with your CLI

### Claude Code

Add to `~/.claude/mcp_servers.json` (or via `claude mcp add`):

```json
{
  "mcpServers": {
    "obsidian-agent-gateway": {
      "command": "node",
      "args": ["D:/working/obsidian-agent-gateway/dist/src/index.js"],
      "env": {
        "AGENT_GATEWAY_VAULT": "D:/working/AgentGateway"
      }
    }
  }
}
```

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.obsidian-agent-gateway]
command = "node"
args = ["D:/working/obsidian-agent-gateway/dist/src/index.js"]
```

### OpenCode

`~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "obsidian-agent-gateway": {
      "type": "local",
      "command": ["node", "D:/working/obsidian-agent-gateway/dist/src/index.js"]
    }
  }
}
```

### Verify

Run the official MCP inspector:

```bash
npm run inspect
```

You should see 8 tools: `agent_boot`, `plan_create`, `plan_revise`, `plan_archive`, `plan_list`,
`task_update`, `task_complete`, `task_get`.

### ChatGPT Apps local development

ChatGPT cannot spawn this server over `stdio`. Run the Streamable HTTP mode and expose it through
an HTTPS tunnel:

```bash
npm run build
npm run start:http
```

In another terminal:

```bash
ngrok http 2091
```

Then create the ChatGPT app with:

```text
MCP Server URL: https://<your-ngrok-domain>/mcp
Authentication: None / No auth
```

Optional HTTP settings:

```bash
# Windows (PowerShell)
$env:AGENT_GATEWAY_HTTP_HOST = '127.0.0.1'
$env:AGENT_GATEWAY_HTTP_PORT = '2091'
```

Health check:

```text
http://127.0.0.1:2091/health
```

This no-auth HTTP mode is for short-lived local development only. Anyone with the tunnel URL can
call exposed tools, including tools that write to the vault or delete tasks.

---

## 4. Install the slash commands

### Claude Code (per-user, simplest)

```bash
mkdir -p ~/.claude/commands
cp slash-commands/claude-code/*.md ~/.claude/commands/
```

### OpenCode (dev-oriented, more detailed templates)

OpenCode uses a different shape: commands are registered in `opencode.json` and
template files live under `~/.config/opencode/commands/obsidian/`. Because OpenCode
is typically where the **coding work** happens, its templates are longer and spell
out the exact MCP tool calls, error handling, and output format. See
`slash-commands/opencode/` for the raw templates and `slash-commands/opencode/README.md`
for the `opencode.json` snippet to paste in.

### Codex

Strip the YAML front-matter out of the Claude-Code templates and drop them in
`~/.codex/prompts/`. See `slash-commands/codex/README.md`.

Available commands:
- `/obsidian-plan-status`
- `/obsidian-plan-create <title>`
- `/obsidian-plan-list [status]`
- `/obsidian-plan-start <task-id>`
- `/obsidian-plan-done [task-id] [summary]`
- `/obsidian-plan-block <task-id> <reason>`
- `/obsidian-plan-unblock <task-id>`
- `/obsidian-plan-note <task-id> <note>`

---

## 5. End-to-end walkthrough

**Step 1 — plan in Claude Code.** Open Claude Code in your project, talk through the feature,
then run:
```
/obsidian-plan-create Add OAuth login
```
Claude generates a plan with `## <task>` headings and commits it to the vault. One plan per
project is "active" at a time; the previous active plan is auto-archived.

**Step 2 — switch CLI.** Open Codex CLI in the same project directory. Run:
```
/obsidian-plan-status
```
Codex calls `agent_boot` and shows the active plan + open tasks without you telling it anything
about the project — the MCP server figures it out from `cwd`.

**Step 3 — start a task.**
```
/obsidian-plan-start 001-schema
```

**Step 4 — review manually.** Read the diff, test in the browser, whatever your workflow is.

**Step 5 — mark done.**
```
/obsidian-plan-done 001-schema DB migration applied and tested
```

**Step 6 — repeat** from step 3 until every task is done.

---

## 6. Configuration reference

| Env var | Default (Windows) | Notes |
|---|---|---|
| `AGENT_GATEWAY_VAULT` | `D:\working\AgentGateway` | Vault root |
| `AGENT_GATEWAY_LOG_LEVEL` | `info` | `debug \| info \| warn \| error` |
| `AGENT_GATEWAY_TZ` | `Asia/Ho_Chi_Minh` | IANA timezone used for date slugs & "today" queries |
| `AGENT_GATEWAY_HTTP_HOST` | `127.0.0.1` | Host for `npm run start:http` |
| `AGENT_GATEWAY_HTTP_PORT` | `2091` | Port for `npm run start:http` |
| `AGENT_GATEWAY_BREAKDOWN_SMALL` | `800` | Lines. Below this, a plan stays as a single task. |
| `AGENT_GATEWAY_BREAKDOWN_LARGE` | `2000` | Lines. Above this, plans are split by H2 + H3. |

---

## 7. Edge cases & what the server does

| Scenario | Behaviour |
|---|---|
| New project, never registered | `agent_boot` auto-registers it using the directory name. |
| Directory name collision (two projects with the same folder name) | Server refuses with an error — rename one directory or edit `_index/projects.json` manually. No silent hashing. |
| Two CLIs grab the same task | `task_update` accepts the change but returns a `session_warning` so the second agent can ask for user confirmation. |
| User edits a task file directly in Obsidian | Next `task_update` is based on the file-on-disk version; no lock. If you pass `expected_version`, a stale write is rejected. |
| Plan > 2000 lines | Auto-split into tasks by H2 + H3 headings. |
| Plan long but no headings | Server returns a warning; a single task is created. |
| Plan active conflict | Creating a new active plan archives the previous one with reason `"Superseded by new active plan"`. |
| CLI crashes mid-task | No lease — task simply stays `in_progress`. Stale tasks (>24h) surface in `agent_boot.stale_tasks`. |
| Audit log growth | One JSONL file per month per plan, under `sessions/`. |

---

## 8. Project structure

```
obsidian-agent-gateway/
├── src/
│   ├── index.ts             ← MCP entry point
│   ├── server.ts            ← tool registration + stdio transport
│   ├── config.ts
│   ├── tools/               ← 8 MCP tools
│   ├── domain/              ← project / plan / task / state-machine / audit
│   ├── vault/               ← filesystem layer (atomic writes, frontmatter)
│   ├── schemas/             ← zod schemas for frontmatter
│   └── utils/               ← slug, breakdown, time, logger
├── slash-commands/
│   ├── claude-code/         ← 8 markdown templates
│   ├── codex/
│   └── opencode/
├── tests/                   ← node:test unit tests
├── AGENTS.md                ← guidance for non-Claude agents
├── CLAUDE.md                ← guidance for Claude Code
├── PLAN.md                  ← long-term design notes
└── README.md                ← you are here
```

---

## 9. Development

```bash
npm run dev          # tsc --watch
npm run start:http   # Streamable HTTP MCP server for ChatGPT Apps local development
npm run typecheck    # tsc --noEmit
npm test             # node:test runner against dist/
npm run inspect      # @modelcontextprotocol/inspector
```

---

## License

MIT.
