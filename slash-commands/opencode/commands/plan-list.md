## Role

You are the **coder** (or curious). Show historical plans for the current project: active, archived, or all.

## Arguments

```
$ARGUMENTS
```

Optional status filter. Valid values: `active`, `archived`, `draft`, or empty (= all).

## What to do

Call `obsidian-agent-gateway.plan_list`:
```json
{
  "cwd": "<absolute-cwd>",
  "status": "<filter-if-provided>"
}
```

Omit the `status` key if `$ARGUMENTS` is empty.

## Output format (Vietnamese)

Render a compact table:
```
| Plan ID                           | Title                      | Status   | Created    |
|-----------------------------------|----------------------------|----------|------------|
| 2026-04-22-auth-refactor          | Auth refactor              | archived | 2026-04-22 |
| 2026-04-23-add-oauth-login        | Add OAuth login            | active   | 2026-04-23 |
```

Truncate titles > 40 chars with `…`. Sort by `created_at` descending (newest first — this is the server default).

If the list is empty:
> Chưa có plan nào <lọc theo status if applicable>.

## Don't

- Do not call `task_get` or `task_list` here. This command is plan-level only.
- Do not filter client-side — pass the status to the server.

Proceed.
