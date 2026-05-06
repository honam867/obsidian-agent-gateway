import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { resolveTaskPlan } from "../domain/plan.js";
import { completeTask } from "../domain/task.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  task_id: z.string().min(1),
  plan_id: z.string().optional(),
  summary: z.string().optional(),
  session: z.string().optional(),
});

export function taskCompleteTool(_ctx: ToolContext): ToolDef {
  return {
    name: "task_complete",
    description:
      "Mark a task as done. This is the user's explicit confirmation point — call only when the user has said the task is satisfactory. Status transitions to `done` and `completed_at` is set.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        task_id: { type: "string" },
        plan_id: { type: "string", description: "Optional — defaults to the active plan." },
        summary: {
          type: "string",
          description: "Short human summary of what was delivered. Appended to the task notes.",
        },
        session: { type: "string" },
      },
      required: ["cwd", "task_id"],
    },
    handler: async (raw) => {
      const input = Input.parse(raw);
      const project = await resolveOrRegisterProject(path.resolve(input.cwd));
      const planId = await resolveTaskPlan(project.slug, input.task_id, input.plan_id);
      const task = await completeTask(project.slug, planId, input.task_id, input.summary, input.session);
      return { project, plan_id: planId, task };
    },
  };
}
