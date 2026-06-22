# SETUP.md — agent-executable setup runbook

> **Read this file, then perform the steps.** You (the coding agent) are being asked to install
> `obsidian-agent-gateway` on this machine and wire it into the user's CLI(s) so every future
> session has persistent memory + cross-CLI review handoff.
>
> **Do not copy the example paths verbatim.** They are placeholders. In Step 2 you compute the real
> absolute paths for *this* machine and substitute them everywhere below.

---

## What you are setting up

A local MCP server (this repo) that stores memory in an Obsidian vault and exposes ~16 memory/review
tools. Once registered + the protocol installed, the user just opens any CLI in any repo and works;
the agent recalls context, saves progress, accumulates lessons, and hands specs/plans between CLIs —
all on its own. See `README.md` §1–2 for the model, `memory-protocol.md` for the behaviour contract.

---

## Step 0 — Prerequisites (check, don't assume)

```bash
node --version   # must be >= 20
```

Obsidian is optional for the server to run — it only needs the vault *folder*. Install Obsidian later
if the user wants to browse the vault visually.

---

## Step 1 — Build the server

From the repo root (the directory containing this file):

```bash
npm install
npm run build      # tsc → produces dist/src/index.js
```

Confirm the entry exists: `dist/src/index.js` must be present. That file is the MCP server.

---

## Step 2 — Compute the two absolute paths (this is the portability step)

You need exactly two values. **Derive them now and reuse them in Steps 3–4.**

1. **`SERVER_ENTRY`** = absolute path to the built entry, i.e. `<this-repo>/dist/src/index.js`.
   Get the repo root with `pwd` (bash) or `Get-Location` (PowerShell), then append `/dist/src/index.js`.
   - On Windows, **use forward slashes** in CLI config JSON (e.g. `C:/Users/me/code/obsidian-agent-gateway/dist/src/index.js`).
     Backslashes in JSON must be escaped and are error-prone — forward slashes work on Windows Node.

2. **`VAULT`** = where the memory lives. Default:
   - Windows → `D:/working/AgentGateway`
   - macOS/Linux → `~/AgentGateway` (expand `~` to the real home path)
   - Or ask the user for a custom location.

   Create the folder if it does not exist (the server also creates it on first run, but creating it
   now avoids confusion):
   ```bash
   mkdir -p "<VAULT>"     # bash
   ```

Write these two values down. Every snippet below uses `SERVER_ENTRY` and `VAULT` as placeholders —
replace them with your computed values before writing any config file.

---

## Step 3 — Register the MCP server with each CLI the user has

Only configure the CLIs the user actually uses. **Merge** into existing config — never overwrite the
whole file (the user may have other MCP servers / settings). Read the file first, add the one block,
write it back.

### Claude Code → `~/.claude.json`

Add under `mcpServers` (create the key if missing):

```json
{
  "mcpServers": {
    "obsidian-agent-gateway": {
      "command": "node",
      "args": ["SERVER_ENTRY"],
      "env": { "AGENT_GATEWAY_VAULT": "VAULT" }
    }
  }
}
```

Or, equivalently, run: `claude mcp add obsidian-agent-gateway -- node SERVER_ENTRY`
(then add the `AGENT_GATEWAY_VAULT` env separately if not using the default vault).

### Codex CLI → `~/.codex/config.toml`

```toml
[mcp_servers.obsidian-agent-gateway]
command = "node"
args = ["SERVER_ENTRY"]
env = { AGENT_GATEWAY_VAULT = "VAULT" }
```

### OpenCode → `~/.config/opencode/opencode.json`

```json
{
  "mcp": {
    "obsidian-agent-gateway": {
      "type": "local",
      "command": ["node", "SERVER_ENTRY"],
      "environment": { "AGENT_GATEWAY_VAULT": "VAULT" }
    }
  }
}
```

> If the user keeps the **default** vault path (Step 2), the `AGENT_GATEWAY_VAULT` env is optional —
> the server falls back to the platform default. Set it explicitly anyway for clarity across machines.

---

## Step 4 — Install the memory protocol (makes the tools fire automatically)

The tools are passive until the agent is told *when* to call them. Install the contents of
[`memory-protocol.md`](./memory-protocol.md) into each CLI's **global** instruction file, **idempotently**
using these markers so re-running setup updates in place instead of duplicating:

```
<!-- agent-gateway-memory:start -->
... (full contents of memory-protocol.md) ...
<!-- agent-gateway-memory:end -->
```

Per CLI:

- **Claude Code** → `~/.claude/CLAUDE.md` — append the marked block. If the markers already exist,
  replace everything between them; otherwise append at the end.
- **Codex** → global `~/.codex/AGENTS.md` (create if absent) — same marked block.
- **OpenCode** → its global instruction file (an `AGENTS.md` referenced by `opencode.json`'s
  `instructions`) — **reference the repo file** rather than copying:
  add `SERVER_ENTRY`'s repo root `memory-protocol.md` path to the `instructions` array so it stays in
  sync automatically. Copy the marked block only if referencing isn't supported.

> Why a marked block: setup stays idempotent. Re-running this runbook after a `git pull` re-syncs the
> protocol without leaving stale duplicates.

---

## Step 5 — Verify (prove it works, don't assume)

1. **Tools are exposed** — from the repo root:
   ```bash
   npm run inspect
   ```
   You should see the memory/review tools (`agent_recall`, `progress_update`, `review_open`, …) listed.

2. **Live round-trip** — restart the CLI so it loads the new MCP server + protocol, then in a fresh
   session ask: *"what was I doing?"* The agent should call `agent_recall(cwd)` on its own. On a brand
   new machine it returns `how: "none"` (no history yet) — that's correct, it means the wiring works.

3. **Optional** — open `VAULT` as a vault in Obsidian to watch `_index/workspace.json`, `features/`,
   `repos/`, `global/` populate as you work. (`.json` files are hidden in Obsidian's file tree by
   default — that's expected; the data is still there.)

---

## Done — what the user does from now on

Nothing special. They open any CLI in any repo under their workspace root and just work. The agent:
- recalls last action + next step + repo lessons/playbooks at session start,
- saves progress / knowledge / lessons at meaningful boundaries,
- hands spec/plan reviews between CLIs through the vault (`review_open → review_note → review_get → review_approve`).

Behaviour contract: [`memory-protocol.md`](./memory-protocol.md). Tool reference: `README.md` §6.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| CLI doesn't list the tools | Wrong `SERVER_ENTRY` path, or the CLI wasn't restarted. Re-check Step 2, restart. |
| `Cannot find module dist/src/index.js` | You skipped `npm run build` (Step 1), or pointed at the repo root instead of `dist/src/index.js`. |
| Windows path errors in JSON | Use forward slashes, not backslashes (Step 2). |
| Agent never calls `agent_recall` | Protocol not installed in the **global** instruction file (Step 4), or installed in a project-local file that this session didn't load. |
| Memory goes to the wrong folder | `AGENT_GATEWAY_VAULT` differs between CLIs. Make all CLIs point at the same `VAULT`. |

All configurable env vars: see `.env.example`.
