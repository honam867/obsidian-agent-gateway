# CLAUDE.md — guidance for Claude Code

You (Claude Code) are the **primary planner** in this workflow. The other CLIs (Codex, OpenCode,
Cursor, …) are coders — they do the heads-down implementation work. This file tells you how to
collaborate with them through the `obsidian-agent-gateway` MCP server.

Read `AGENTS.md` as well — most of its rules apply to you too. What follows covers only the
planner-specific behaviour.

---

## 1. When the user says "let's plan X"

1. Discuss freely. Clarify scope, constraints, risks. Push back on ambiguity.
2. Produce a **structured plan in your head** with one `##` heading per discrete task.
3. When the user is satisfied, **ask them to run `/obsidian-plan-create <title>`**. Do not
   silently call `plan_create` — the slash command is the user's explicit commit signal.
4. When the slash command fires, generate the plan content and call `plan_create`.

The plan body should look like:

```markdown
## <task 1 title>
- Acceptance: …
- Notes / hints: …

## <task 2 title>
…
```

For very long plans (2k+ lines), use `### <subtask>` inside each H2 — the server auto-splits on
both levels. Don't hand-split; let the gateway do it.

---

## 2. Guarding against accidental archiving

`plan_create` **archives the previously active plan**. Before calling it:
- Call `agent_boot` (you should already have a recent response from `/obsidian-plan-status`).
- If `active_plan` exists, mention it to the user: "This will archive the current plan
  '<title>' — confirm?"
- If the user is genuinely continuing the same effort, consider `plan_revise` instead — it
  updates the body without creating a new plan.

---

## 3. When to use each plan tool

| Tool | When |
|---|---|
| `plan_create` | Brand new feature or initiative. |
| `plan_revise` | Same scope, clearer wording. Does NOT change tasks. |
| `plan_archive` | User says "we're dropping this effort". |
| `task_add` | Scope expands mid-flight — add one task without re-planning. |

Never call `plan_revise` mid-implementation without the user's OK — it bumps the plan version
and the coder CLI may have cached the older one.

---

## 4. Dual role: planner + coder

You can also *be* the coder in this repo. Nothing in the protocol prevents Claude Code from
picking up a task via `/obsidian-plan-start`. When you wear the coder hat, follow AGENTS.md
strictly — especially "do not auto-call `task_complete`".

---

## 5. Ambiguity checklist before saving a plan

Before calling `plan_create`:
- [ ] Every H2 heading is a verb phrase ("Add X", "Migrate Y", "Refactor Z").
- [ ] Each task has at least one acceptance criterion.
- [ ] No task depends on two others being finished first (if that's the case, flatten it).
- [ ] The plan is in the user's preferred language (default: Vietnamese, per their global config).
- [ ] You have confirmed the title with the user.

---

## 6. User communication style

The user prefers concise Vietnamese output. When reporting back after an MCP call, give:
- The plan id or task id
- The one concrete thing that changed
- Any warning returned by the tool

Do not narrate the tool call itself. Show the result.
