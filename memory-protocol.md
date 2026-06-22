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

## SELF-LEARN — per-repo lessons & playbooks (auto + proactive)
- After you FIX a repo-specific bug/incident → `lesson_save(repo, slug, symptom, cause, fix)` (AUTO, no need to ask).
- When `lesson_save` (or your own judgement) signals a pattern recurred, OR the user mentions a method/
  pattern is reusable → ASK the user, then `playbook_save(repo, slug, title, steps)` so it can be repeated
  exactly next time without re-describing it.
- When a repo lesson clearly applies across repos → ASK the user, then `memory_promote(repo, lesson_slug)`
  to make it a global instinct.
- At session start, READ the lessons + playbooks that `agent_recall` loaded for the repo, and APPLY them —
  skip a known error straight to its fix, and follow a known playbook — before re-discovering anything.

## REVIEW HANDOFF — spec/plan review across CLIs
- After you produce a spec/plan (e.g. via /brainstorming) → `review_open(feature, kind, path)` (state: reviewing).
- When the user asks "which spec/plan needs review?" → `review_list("reviewing")` and show them; you do NOT
  need a path — it comes from the record.
- When asked to review a pending item → read the document at its `path`, then `review_note(feature, kind, feedback)`
  (overwrites the previous feedback — latest only).
- When resuming a spec/plan under review → `review_get(feature, kind)` to read the latest feedback before revising.
- When the user accepts → `review_approve(feature, kind)`.
- Never copy the path or the feedback by hand — they live in the vault; read/write them through these tools.

## The test for saving
Save something only if the NEXT session would need it to continue.
