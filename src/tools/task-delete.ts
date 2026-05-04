import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { deleteTask, getActivePlan } from "../domain/plan.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  task_id: z.string().min(1),
  plan_id: z.string().optional(),
});

export function taskDeleteTool(_ctx: ToolContext): ToolDef {
  return {
    name: "task_delete",
    description:
      "Permanently delete a task from a plan. The plan TOC is rebuilt automatically. Use with care — deleted tasks cannot be recovered. Prefer blocking (status=blocked) when the task might come back later.",
    annotations: {
      title: "Delete Task",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        task_id: { type: "string", description: "Task id to delete, e.g. '003-send-email'." },
        plan_id: {
          type: "string",
          description: "Plan id. Defaults to the project's current active plan.",
        },
      },
      required: ["cwd", "task_id"],
    },
    handler: async (raw) => {
      const input = Input.parse(raw);
      const project = await resolveOrRegisterProject(path.resolve(input.cwd));

      let planId = input.plan_id;
      if (!planId) {
        const plan = await getActivePlan(project.slug);
        if (!plan) throw new Error("No active plan for project; pass plan_id explicitly.");
        planId = plan.id;
      }

      await deleteTask(project.slug, planId, input.task_id);

      return { project, plan_id: planId, deleted_task_id: input.task_id };
    },
  };
}
