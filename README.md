# obsidian-agent-gateway

An **MCP server** that turns an Obsidian vault into a **persistent memory + harness layer** for CLI
coding agents (Claude Code, Codex CLI, OpenCode, …). Every action goes through the same markdown
files, so an agent that opens a session **already knows what it was doing, in which repo/feature,
and what it has learned** — without re-reading the codebase. State is legible to humans and shared
across every CLI.

> **Two things this gives you**
> 1. **Cross-session, cross-CLI memory** — open any CLI in any repo and resume instantly.
> 2. **A self-learning harness** — the agent accumulates codebase knowledge, per-repo lessons,
>    reusable playbooks, and global "instincts", and gets more useful over time.

> **Roles in the workflow** (plan/task layer)
> - **Planner** — usually Claude Code. Discusses with the user, commits a plan with `/obsidian-plan-create`.
> - **Coder** — any CLI. Reads the active plan, picks a task, implements it.
> - **Reviewer** — optional. The user reviews, then a slash command marks the task done.

---

## 1. How it works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Claude Code │     │ Codex CLI   │     │ OpenCode    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       └───── MCP (stdio) ─┼────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  MCP Server │   ← tools, memory tiers, self-learn engine
                    │  (Node.js)  │
                    └──────┬──────┘
                           │ atomic markdown writes
                    ┌──────▼──────┐
                    │  Obsidian   │   ← single source of truth (the "brain")
                    │   Vault     │   ← human-readable, git-friendly
                    └─────────────┘
```

### Scope model

```
Workspace = D:/working (root)             ← physical location, NOT a scope key
Repo      = each git-root under workspace ← owns codebase knowledge / lessons / playbooks (auto-discovered)
Feature   = free-form label (misa-payout) ← PRIMARY scope unit; may span multiple repos; owns working memory + plans
Global    = cross-project, cross-CLI      ← instincts (self-evolving)
```

The agent does **not** need to be told the project: `agent_recall(cwd)` resolves the repo from the
current directory and the feature you last worked on there. From the workspace root it falls back to
the most-recently-touched feature.

### Vault layout

```
AgentGateway/                          ← the Obsidian vault (default: D:\working\AgentGateway)
├── .obsidian/                         ← auto-created so Obsidian opens the folder directly
├── _index/
│   └── workspace.json                 ← repo + feature registry (paths, active_feature per repo)
├── features/
│   └── <feature>/                     ← one folder per feature (cross-repo)
│       ├── _feature.md                ← repos[], paths[], status
│       ├── working/current.md         ← WORKING memory: last action / where I stopped / next step
│       └── plans/<plan-id>/           ← plan + tasks (the plan/task machinery)
├── repos/
│   └── <repo>/                        ← one folder per registered repo
│       ├── _repo.md                   ← run/test cmds, architecture summary
│       ├── knowledge/<area>.md        ← KNOWLEDGE: durable codebase facts
│       ├── lessons/<slug>.md          ← LESSONS: per-repo bug/incident (symptom→cause→fix) + confidence
│       └── playbooks/<slug>.md        ← PLAYBOOKS: per-repo reusable procedure + confidence
└── global/
    ├── instincts/<slug>.md            ← INSTINCTS: how the agent should work (cross-repo) + confidence
    └── playbooks/                     ← (reserved)
```

### Task state machine (plan/task layer)

```
draft ─▶ active ─▶ in_progress ─▶ done
           │            │            ▲
           │            ▼            │
           └───────▶ blocked ────────┘
```

No review step is enforced — mark `done` when you (the user) are satisfied.

---

## 2. The memory layer (the harness)

Five tiers, each stored as markdown-with-frontmatter and loaded just-in-time:

| Tier | Stores | Scope | Saved | Confidence |
|---|---|---|---|---|
| **working** | "what I'm doing now, where I stopped, next step" | feature | auto | — |
| **knowledge** | durable codebase facts (architecture, convention, gotcha, run/test cmd) | repo | auto | — |
| **lessons** | a fixed bug/incident — symptom → cause → fix | repo | auto (after a fix) | ✅ |
| **playbooks** | a reusable procedure/pattern/business-rule ("do it the same way") | repo | **ask first** | ✅ |
| **instincts** | how the AGENT should work (friction → workaround) | global | auto | ✅ |

**Confidence + reinforcement:** lessons / playbooks / instincts start at `0.5`; re-saving the same
slug reinforces (`min(1, c + (1-c)*0.5)` → `0.75`, …) and bumps an `observations` counter.

**Self-learn engine (proactive):** when a lesson recurs (`observations ≥ AGENT_GATEWAY_LEARN_THRESHOLD`,
default `2`), `lesson_save` returns a nudge in `next_actions`, prompting the agent to **ask you**
whether to capture a reusable `playbook` or `memory_promote` the lesson into a global instinct.
At session start, `agent_recall` loads the relevant lessons + playbooks so the agent can skip a known
error straight to its fix instead of re-discovering it.

**The protocol** that tells any agent *when* to call *which* memory tool lives in
[`memory-protocol.md`](./memory-protocol.md) and is mirrored into each CLI's global instruction file
(see §5). It is instruction-driven (portable across CLIs), not a hard hook.

---

## 3. Install & run

### Prerequisites
- **Node.js ≥ 20**
- **Obsidian** (open `D:\working\AgentGateway` as a vault).

### Clone & build

```bash
git clone <this-repo> obsidian-agent-gateway
cd obsidian-agent-gateway
npm install
npm run build
```

### (Optional) Custom vault path

Default is `D:\working\AgentGateway` on Windows (or `~/AgentGateway` elsewhere). Override:

```bash
# Windows (PowerShell)
$env:AGENT_GATEWAY_VAULT = 'D:\path\to\YourVault'
# macOS / Linux
export AGENT_GATEWAY_VAULT=/path/to/YourVault
```

See `.env.example` for all configurable variables.

---

## 4. Register the MCP server with your CLI

### Claude Code

Add to `~/.claude.json` (or via `claude mcp add`):

```json
{
  "mcpServers": {
    "obsidian-agent-gateway": {
      "command": "node",
      "args": ["D:/working/obsidian-agent-gateway/dist/src/index.js"],
      "env": { "AGENT_GATEWAY_VAULT": "D:/working/AgentGateway" }
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
      "command": ["node", "D:/working/obsidian-agent-gateway/dist/src/index.js"],
      "environment": { "AGENT_GATEWAY_VAULT": "D:/working/AgentGateway" }
    }
  }
}
```

### Verify

```bash
npm run inspect
```

You should see the MCP tools listed in §6.

### ChatGPT Apps local development

ChatGPT cannot spawn this server over `stdio`. Run Streamable HTTP mode and tunnel it:

```bash
npm run build
npm run start:http      # listens on 127.0.0.1:2091 by default
# in another terminal:
ngrok http 2091
# MCP Server URL: https://<your-ngrok-domain>/mcp   (Auth: None)
```

Health check: `http://127.0.0.1:2091/health`. This no-auth HTTP mode is for short-lived local dev
only — anyone with the tunnel URL can call tools that write to the vault.

---

## 5. Enable automatic memory (the protocol)

The memory tools are passive until an agent is told *when* to call them. Install the protocol into
each CLI's **global** instruction file so it applies in every repo:

- **Claude Code** → append the contents of [`memory-protocol.md`](./memory-protocol.md) to
  `~/.claude/CLAUDE.md` (inside `<!-- agent-gateway-memory:start/end -->` markers so it can be
  updated idempotently).
- **OpenCode** → add a global instruction file referencing the protocol (see §8 / `slash-commands/opencode/`).
- **Codex** → add it to the global `AGENTS.md`.

After that, a natural prompt like *"what was I doing?"* makes the agent call `agent_recall(cwd)`
itself, and it saves progress / knowledge / lessons at meaningful boundaries on its own.

### (Optional) slash commands

Plan/task slash commands (`/obsidian-plan-*`) are still available:

- **Claude Code:** `cp slash-commands/claude-code/*.md ~/.claude/commands/`
- **OpenCode:** templates + `opencode.json` snippet in `slash-commands/opencode/`
- **Codex:** strip the YAML front-matter, drop in `~/.codex/prompts/` (`slash-commands/codex/README.md`)

Commands: `/obsidian-plan-status`, `-create <title>`, `-list [status]`, `-start <task-id>`,
`-done [task-id] [summary]`, `-block <task-id> <reason>`, `-unblock <task-id>`, `-note <task-id> <note>`.

---

## 6. MCP tools

**Memory — read**
- `agent_recall(cwd)` — call FIRST in a session (or when asked "what was I doing"). Resolves repo +
  feature from `cwd`, returns last action / next step / knowledge / lessons / playbooks / instincts.
- `memory_recall(feature)` — same bundle for an explicit feature slug.
- `memory_get`-style readers: `lesson_get(repo, slug)`, `playbook_get(repo, slug)`.

**Memory — write**
- `context_set(feature, repos, paths)` — set/create the active feature (marks it active per repo).
- `progress_update(feature, last_action, next_step)` — overwrite `working/current.md`.
- `knowledge_save(repo, area, body, source_paths)` — durable codebase fact.
- `lesson_save(repo, slug, symptom, cause, fix)` — per-repo bug fix (auto; emits a nudge when it recurs).
- `playbook_save(repo, slug, title, steps)` — per-repo reusable procedure (ask the user first).
- `instinct_save(slug, title, trigger, action, why)` — global working-method (re-save reinforces).
- `memory_promote(repo, lesson_slug)` — turn a recurring repo lesson into a global instinct (ask first).

**Plan / task** (legacy layer, unchanged)
- `agent_boot`, `plan_create`, `plan_revise`, `plan_archive`, `plan_list`,
  `task_add`, `task_edit`, `task_delete`, `task_update`, `task_complete`, `task_get`, `task_list`,
  `review_submit`, `project_relink`.

---

## 7. Scenarios

**Resume work (any CLI, any repo).** You: *"tiếp tục / what was I doing?"* → agent calls
`agent_recall(cwd)` → "Feature `misa-payout` (cozrum-server + cozrum-cms). Last: added blockIds.
Next: trace cash remap." + relevant knowledge / lessons / instincts. No codebase re-read.

**Save at boundaries.** Finish a step → `progress_update`. Discover a codebase fact → `knowledge_save`.
Fix a bug → `lesson_save` (auto).

**Self-learn.** Hit the same bug again (obs ≥ 2) → the tool nudges → the agent asks
*"this recurred — capture a playbook / promote to a global instinct?"* → on your OK, `playbook_save`
or `memory_promote`.

**Cross-repo feature.** `misa-payout` spans `cozrum-server` + `cozrum-cms`; recall aggregates both
repos' knowledge/lessons under the one feature.

---

## 8. Configuration reference

| Env var | Default (Windows) | Notes |
|---|---|---|
| `AGENT_GATEWAY_VAULT` | `D:\working\AgentGateway` | Vault root |
| `AGENT_GATEWAY_LOG_LEVEL` | `info` | `debug \| info \| warn \| error` |
| `AGENT_GATEWAY_TZ` | `Asia/Ho_Chi_Minh` | IANA timezone for date slugs & "today" queries |
| `AGENT_GATEWAY_HTTP_HOST` | `127.0.0.1` | Host for `npm run start:http` |
| `AGENT_GATEWAY_HTTP_PORT` | `2091` | Port for `npm run start:http` |
| `AGENT_GATEWAY_LEARN_THRESHOLD` | `2` | `observations` count at which `lesson_save` nudges to capture a playbook / promote |
| `AGENT_GATEWAY_BREAKDOWN_SMALL` | `800` | Lines. Below this, a plan stays a single task. |
| `AGENT_GATEWAY_BREAKDOWN_LARGE` | `2000` | Lines. Above this, plans split by H2 + H3. |

---

## 9. Edge cases & behaviour

| Scenario | Behaviour |
|---|---|
| Session opened at the workspace root | `agent_recall` resolves the most-recently-touched feature (no single repo). |
| Session opened inside a repo | Resolves that repo's `active_feature`; falls back to the repo name. |
| New repo, never registered | `agent_recall` / `registerRepo` auto-registers it from the git root. |
| Feature spans multiple repos | One feature; recall aggregates each repo's knowledge + lessons + playbooks. |
| Same lesson/playbook slug re-saved | Reinforced (confidence up, `observations`+1, `created_at` kept) — never duplicated. |
| Lesson recurs (`observations ≥ threshold`) | `lesson_save` returns a proactive nudge in `next_actions`. |
| Repo-specific bug vs cross-repo working habit | Bug → `lesson` (per-repo); working habit → `instinct` (global). |
| Two CLIs grab the same task | `task_update` returns a `session_warning` for confirmation. |
| User edits a vault file in Obsidian | Next write is based on file-on-disk; pass `expected_version` to reject stale writes. |
| Plan > 2000 lines | Auto-split into tasks by H2 + H3 headings. |
| CLI crashes mid-task | No lease — stale `in_progress` tasks (>24h) surface in `agent_boot.stale_tasks`. |

---

## 10. Project structure

```
obsidian-agent-gateway/
├── src/
│   ├── index.ts / http.ts    ← MCP entry points (stdio + Streamable HTTP)
│   ├── server.ts             ← tool registration + transport
│   ├── config.ts
│   ├── tools/                ← one file per MCP tool
│   ├── domain/               ← feature, working, knowledge, lesson, playbook, instinct,
│   │                            recall, agent-recall, recency, promote, plan, task, state-machine
│   ├── vault/                ← filesystem layer (atomic writes, frontmatter, paths, registries)
│   ├── schemas/              ← zod schemas for frontmatter
│   └── utils/                ← slug, breakdown, time, logger
├── slash-commands/           ← claude-code / codex / opencode templates
├── tests/                    ← node:test unit tests (run against dist/)
├── memory-protocol.md        ← the cross-CLI "when to call which tool" protocol
├── docs/superpowers/         ← specs + implementation plans
├── AGENTS.md / CLAUDE.md     ← per-CLI guidance
└── README.md                 ← you are here
```

---

## 11. Development

```bash
npm run dev          # tsc --watch
npm run start:http   # Streamable HTTP MCP server (ChatGPT Apps local dev)
npm run typecheck    # tsc --noEmit
npm test             # node:test runner against dist/
npm run inspect      # @modelcontextprotocol/inspector
```

---

## License

MIT.
