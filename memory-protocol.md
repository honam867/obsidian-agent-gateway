# Agent Memory Protocol (obsidian-agent-gateway)

You have a persistent memory via the `obsidian-agent-gateway` MCP server. Follow this protocol so
work survives across sessions and CLIs. Keep it low-noise: only act at the moments below.

## LOAD — at session start, or when asked "what was I doing / continue / which repo"
- Call `agent_recall` with your current working directory (`cwd`). It resolves the repo + the feature
  you last worked on and returns: last action, next step, knowledge pointers, top instincts.
- Call it ONCE per session and reuse the result. Do not re-recall unless the feature changes.
- You do NOT need to know the feature slug — `agent_recall` resolves it.

## SWITCH — when the user clearly moves to a different feature/initiative
- Call `context_set(feature, repos, paths)` with a short kebab-case feature label and the repo slugs
  it spans (e.g. a feature touching two repos lists both).

## SAVE — at meaningful boundaries only (NOT every message)
- `progress_update(feature, last_action, next_step)` — when a meaningful step/task completes, when
  switching tasks, and when wrapping up. Save INCREMENTALLY at each boundary; do not wait for the end
  (the session may stop first).
- `knowledge_save(repo, area, body, source_paths)` — when you learn a durable codebase fact worth
  reusing (architecture, convention, gotcha, run/test command).
- `instinct_save(slug, title, trigger, action, why)` — when you hit friction and found a better way to
  WORK (re-saving the same slug reinforces it).

## DO NOT
- Save on every message, or save trivial/obvious facts, raw tool output, or secrets.
- Recall repeatedly within a session.
- Invent feature slugs — let `agent_recall` resolve them.

## The test for saving
Save something only if the NEXT session would need it to continue.
