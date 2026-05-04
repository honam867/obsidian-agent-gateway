## Role

You are acting as a **planner**. Normally Claude Code is the primary planner, but OpenCode can also create a plan when the user is working directly here. Be extra careful: creating a new plan **archives the previously active plan** for this project.

## Arguments

```
$ARGUMENTS
```

Use as the plan title. If empty, ask the user for a short title (4–10 words).

## Pre-flight

1. Call `obsidian-agent-gateway.agent_boot` (unless you have a fresh cached response).
2. If `active_plan` is NOT null, show a warning:
   > ⚠️ Project đã có plan active: `<id>` — <title>. Nếu tạo plan mới, plan cũ sẽ bị **archive**. Tiếp tục?
   Wait for explicit confirmation. If the user wants to revise the existing plan instead, call `/obsidian-plan-list active` and guide them to use `plan_revise` via direct MCP call (no slash shortcut for revise yet — tell them to ask Claude Code).

## What to do

### Step 1 — Gather the plan content

The plan content should already have been discussed with the user. If it hasn't, STOP and help the user draft it first — don't invent a plan from thin air.

Structure the markdown:
```markdown
## <task 1 title — verb phrase, e.g. "Add DB migration for users table">
- Acceptance:
  - <criterion 1>
  - <criterion 2>
- Notes:
  - <hint, reference, risk>

## <task 2 title>
...
```

Guidelines:
- One H2 per coder-sized task (roughly 1–4 hours of work).
- Titles start with a verb.
- At least one acceptance criterion per task.
- For a very large effort (1500+ lines of plan markdown), also use `### <subtask>` under each H2 — the gateway will split on both levels.

### Step 2 — Call `plan_create`

```json
{
  "cwd": "<absolute-cwd>",
  "title": "<title from $ARGUMENTS>",
  "content": "<full markdown content>",
  "tags": []
}
```

### Step 3 — Report

```
✅ Plan mới đã tạo: `<plan.id>` — <title>
   Tasks được sinh: <task_ids.length> (strategy: <strategy>)
   <if warning> ⚠️ Warning: <warning>
   <if previous plan existed> Plan cũ `<prev-id>` đã bị archive.
```

List the first 3–5 task ids so the user sees what was created.

Then suggest the next action:
> Gợi ý: chạy `/obsidian-plan-start <first-task-id>` để bắt đầu.

## Don't

- Do not create a plan without the user's explicit intent. This slash-command invocation IS that intent — but if `$ARGUMENTS` is empty AND there has been no plan discussion in this session, ask before proceeding.
- Do not translate task titles if the user wrote them in Vietnamese or any other language — preserve their wording.
- Do not sneak in tasks that weren't discussed.
- Do not call `plan_revise` here. That is a separate flow.

## Error handling

- "Project slug conflict" → relay to user; abort. Directory name conflicts are resolved manually.
- Anything else → report error verbatim.

Proceed.
