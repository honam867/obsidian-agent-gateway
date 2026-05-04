import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { getActivePlan } from "../domain/plan.js";
import { getTask } from "../domain/task.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  task_id: z.string().min(1),
  plan_id: z.string().optional(),
});

export function taskGetTool(_ctx: ToolContext): ToolDef {
  return {
    name: "task_get",
    description:
      "Fetch full detail (frontmatter + body) of a single task. Use when the agent needs the acceptance criteria or notes that are not in the boot summary.",
    annotations: {
      title: "Get Task",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        task_id: { type: "string" },
        plan_id: { type: "string" },
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
      const task = await getTask(project.slug, planId, input.task_id);
      if (!task) throw new Error(`Task not found: ${input.task_id}`);
      return { project, plan_id: planId, task: task.fm, body: task.body };
    },
  };
}
