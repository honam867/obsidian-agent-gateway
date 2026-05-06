import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { resolveTaskPlan } from "../domain/plan.js";
import { getTask, updateTask } from "../domain/task.js";
import { TaskStatus } from "../schemas/task.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  task_id: z.string().min(1),
  plan_id: z.string().optional(),
  status: TaskStatus.optional(),
  note: z.string().optional(),
  block_reason: z.string().nullable().optional(),
  session: z.string().nullable().optional(),
  expected_version: z.number().int().nonnegative().optional(),
});

export function taskUpdateTool(_ctx: ToolContext): ToolDef {
  return {
    name: "task_update",
    description:
      "Generic task update. Use for: starting a task (status=in_progress), blocking, unblocking, adding notes, or releasing a claim (session=null). If two sessions update the same task, a warning is returned so the agent can prompt the user.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        task_id: { type: "string", description: "Task id (e.g. '001-schema')." },
        plan_id: {
          type: "string",
          description: "Optional — defaults to the project's active plan.",
        },
        status: {
          type: "string",
          enum: ["draft", "active", "in_progress", "blocked", "done"],
        },
        note: { type: "string", description: "Free-form note appended to the task body." },
        block_reason: { type: "string", description: "Required when status=blocked." },
        session: {
          type: "string",
          description:
            "Session identifier claiming the task. Pass null to release. If omitted, session is unchanged.",
        },
        expected_version: {
          type: "number",
          description:
            "Optimistic-concurrency guard. If provided and mismatched, the update fails and you must re-fetch.",
        },
      },
      required: ["cwd", "task_id"],
    },
    handler: async (raw) => {
      const input = Input.parse(raw);
      const project = await resolveOrRegisterProject(path.resolve(input.cwd));
      const planId = await resolveTaskPlan(project.slug, input.task_id, input.plan_id);

      const current = await getTask(project.slug, planId, input.task_id);
      if (!current) throw new Error(`Task not found: ${input.task_id}`);

      const sessionConflict =
        input.session !== undefined &&
        input.session !== null &&
        current.fm.session &&
        current.fm.session !== input.session
          ? {
              conflict: true,
              current_session: current.fm.session,
              incoming_session: input.session,
              message:
                "Task is already claimed by another session. The update proceeded, but ask the user to confirm takeover.",
            }
          : null;

      const updated = await updateTask(project.slug, planId, input.task_id, {
        status: input.status,
        note: input.note,
        blockReason: input.block_reason ?? undefined,
        session: input.session ?? undefined,
        expectedVersion: input.expected_version,
      });

      return { project, plan_id: planId, task: updated, session_warning: sessionConflict };
    },
  };
}
