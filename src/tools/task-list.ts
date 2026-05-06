import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { getActivePlan, getPlanById } from "../domain/plan.js";
import { listTasks } from "../domain/task.js";
import { TaskStatus } from "../schemas/task.js";
import type { ToolContext, ToolDef } from "./types.js";

const TASK_STATUSES: [TaskStatus, ...TaskStatus[]] = [
  "draft",
  "active",
  "in_progress",
  "blocked",
  "done",
];

const Input = z.object({
  cwd: z.string().min(1),
  plan_id: z.string().optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

export function taskListTool(_ctx: ToolContext): ToolDef {
  return {
    name: "task_list",
    description:
      "List all tasks for a plan. Pass plan_id to target a specific plan, or omit to use the current active plan. Optionally filter by status.",
    annotations: {
      title: "List Tasks",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Absolute path to the project root." },
        plan_id: {
          type: "string",
          description: "Plan id to list tasks for. Defaults to the current active plan.",
        },
        status: {
          type: "string",
          enum: TASK_STATUSES,
          description: "Filter tasks by status. Omit to return all tasks.",
        },
      },
      required: ["cwd"],
    },
    handler: async (raw) => {
      const input = Input.parse(raw);
      const project = await resolveOrRegisterProject(path.resolve(input.cwd));

      let planId = input.plan_id;
      if (!planId) {
        const plan = await getActivePlan(project.slug);
        if (!plan) throw new Error("No active plan for project; pass plan_id explicitly.");
        planId = plan.id;
      } else {
        const plan = await getPlanById(project.slug, planId);
        if (!plan) throw new Error(`Plan not found: ${planId}`);
      }

      const tasks = await listTasks(project.slug, planId, input.status ? { status: input.status } : undefined);
      return {
        project,
        plan_id: planId,
        status_filter: input.status ?? "all",
        total: tasks.length,
        tasks,
      };
    },
  };
}
