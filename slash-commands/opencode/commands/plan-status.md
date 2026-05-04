## Role

You are the **coder** in a multi-CLI workflow. The user wants a quick briefing of what is on the plate for the current project, read from the shared Obsidian Agent Gateway (a vault coordinated through the `obsidian-agent-gateway` MCP server).

This is a **read-only** command. Do not mutate any task state.

## What to do

1. Figure out the current working directory. Prefer `pwd` / shell's `cwd`; fall back to the value shown in the OpenCode status bar. Use the absolute path.
2. Call the MCP tool **`obsidian-agent-gateway.agent_boot`** with:
   ```json
   {
     "cwd": "<absolute-cwd>",
     "agent": {
       "cli": "opencode",
       "session": "opencode-<short-id>",
       "role": "coder"
     }
   }
   ```
   - `session` should be a short stable id for this OpenCode session. Reuse the same id across later `task_update` calls in this session — it lets the gateway detect takeovers.
   - If you already called `agent_boot` within the last 5 minutes in this same session, skip the call and reuse the cached response (the previous response has a `cache_until` timestamp).

3. Parse the response and present it to the user **in Vietnamese**, using this format:

   ```
   📋 <project-slug> — <absolute path>
   🟢 Plan đang active: <plan-id> — <title>
      Tasks: <count_active> active · <count_in_progress> in_progress · <count_blocked> blocked · <count_done> done / <total>

   ⏳ Đang dở (<count>):
     - <task-id>: <title>  (started <relative-time>, last update <relative-time>)

   🆕 Chưa ai nhận (<count>):
     - <task-id>: <title>

   ⛔ Blocked (<count>):
     - <task-id>: <title> — <block_reason>

   ⚠️ Stale (in_progress > 24h) (<count>):
     - <task-id>: <title> — updated <relative-time>

   💡 Gợi ý: <hints joined by "; ">
   ```

4. If `active_plan` is `null`, say: "Chưa có plan nào active. Bảo Claude Code chạy `/obsidian-plan-create` để tạo plan đã bàn xong."

5. If the response returns `my_active_tasks` (tasks this session still holds), mention them first — the user probably wants to resume.

## Error handling

- If the MCP call throws "Project slug conflict" → relay the error verbatim plus the suggestion to rename the directory or edit `_index/projects.json`. Do not retry.
- If the MCP server is not reachable → remind the user to check that `obsidian-agent-gateway` is registered in `~/.config/opencode/opencode.json` under `mcp` and that the server builds (`npm run build` inside the repo).

## Don't

- Do not call `task_update`, `task_get`, `plan_list`, or any write tool. This is status-only.
- Do not invent task ids; quote exactly what `agent_boot` returned.
- Do not summarise multiple tasks into one line — the user wants each task visible.

$ARGUMENTS
