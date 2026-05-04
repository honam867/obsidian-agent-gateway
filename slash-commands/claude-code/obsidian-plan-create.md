---
description: Create a new active plan for the current project. Intended for use by the planner (typically Claude Code) after discussing the plan with the user.
argument-hint: <plan title>
---

The user wants to save the plan we just discussed. Title hint: **$ARGUMENTS**

Follow this workflow:

1. Confirm the title with the user. If `$ARGUMENTS` is empty, ask for a short title.
2. Produce a **markdown plan** with this structure. If the plan is long, use `## <task name>` headings — the MCP server will auto-split each H2 into its own task. For very long plans, you may also use `### <subtask>` under each H2.
   ```
   ## <task 1 title>
   <acceptance criteria + notes>

   ## <task 2 title>
   ...
   ```
3. Call MCP tool `plan_create` on `obsidian-agent-gateway` with:
   - `cwd`: current working directory
   - `title`: the confirmed title
   - `content`: the full markdown content from step 2
4. Report back in Vietnamese: plan id, how many tasks were created, the breakdown strategy used, and any warning.

Note: creating a new plan automatically archives the previous active plan for this project. Warn the user if they had a previously active plan.
