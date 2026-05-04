# Codex CLI slash command adapter

Codex CLI looks for prompt templates in `~/.codex/prompts/` (or `./.codex/prompts/` for per-project).

Each file is a plain markdown prompt. Codex does not use YAML front-matter; the filename
(without `.md`) becomes the command name.

## Install

```bash
# macOS / Linux
mkdir -p ~/.codex/prompts
for f in slash-commands/claude-code/*.md; do
  name=$(basename "$f")
  # strip YAML front-matter block before copying
  awk 'BEGIN{in_fm=0} /^---$/{in_fm=!in_fm; next} !in_fm{print}' "$f" > ~/.codex/prompts/"$name"
done
```

```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path $HOME\.codex\prompts | Out-Null
Get-ChildItem slash-commands\claude-code\*.md | ForEach-Object {
  $raw = Get-Content $_.FullName -Raw
  # remove YAML front-matter
  $body = [regex]::Replace($raw, '(?s)^---\r?\n.*?\r?\n---\r?\n', '')
  Set-Content -Path (Join-Path $HOME\.codex\prompts $_.Name) -Value $body
}
```

## MCP registration

In `~/.codex/config.toml`:
```toml
[mcp_servers.obsidian-agent-gateway]
command = "node"
args = ["D:/working/obsidian-agent-gateway/dist/src/index.js"]
```

(Adjust the path to match where you cloned this repo.)

## Usage

After restarting Codex CLI, the commands appear as `/obsidian-plan-status`, etc.
Codex substitutes `$ARGUMENTS` the same way Claude Code does.
