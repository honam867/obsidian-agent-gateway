## Role

You are the **coder**. Append a freeform note to a task's body without changing its status. Use this for:
- progress snapshots ("migration applied, tests still wip")
- decisions ("chose library X over Y because...")
- questions for the planner ("user flow when email is null?")
- temporary context you'll need tomorrow

## Arguments

```
$ARGUMENTS
```

Parse as `<task-id> <note...>`. Both REQUIRED.

## Resolution rules

- Task id must match `^\d{3}-[a-z0-9-]+$`. If missing, ask; do not guess.
- Note must be ≥ 3 characters of actual content (not just punctuation). If missing, ask: "Nội dung note là gì?"

## What to do

Call `obsidian-agent-gateway.task_update`:
```json
{
  "cwd": "<absolute-cwd>",
  "task_id": "<task-id>",
  "note": "<note>",
  "session": "opencode-<short-id>"
}
```

(No `status` field — this call does not change state.)

## Confirm

```
📝 Đã thêm note vào `<task-id>`.
```

One line. No need to echo the note back — the user just typed it.

## Don't

- Do not summarise or paraphrase the user's note. Send it through verbatim.
- Do not change `status` in this command. If the user wants to block/unblock/complete alongside the note, tell them to use the dedicated command.
- Do not append multiple notes in one call — each `/obsidian-plan-note` is one note. If the user pastes a multi-line message, send it as one note (newlines preserved).

Proceed.
