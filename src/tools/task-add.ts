import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { addTask, getActivePlan } from "../domain/plan.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  title: z.string().min(1),
  content: z.string().optional(),
  plan_id: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export function taskAddTool(_ctx: ToolContext): ToolDef {
  return {
    name: "task_add",
    description:
      "Add a single new task to an existing plan. Appended after the last existing task; plan TOC is rebuilt automatically. Use when scope expands mid-implementation — do not re-plan, just add tasks.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        title: {
          type: "string",
          description: "Short verb phrase, e.g. 'Add pagination to customer list'.",
        },
        content: {
          type: "string",
          description:
            "Task body: acceptance criteria, notes, hints. Markdown is fine. Leave blank to fill in later.",
        },
        plan_id: {
          type: "string",
          description: "Target plan id. Defaults to the project's current active plan.",
        },
        depends_on: {
          type: "array",
          items: { type: "string" },
          description: "Task IDs this task depends on, e.g. ['001-schema', '002-api'].",
        },
        tags: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["cwd", "title"],
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

      const result = await addTask(project.slug, planId, {
        title: input.title,
        content: input.content,
        dependsOn: input.depends_on,
        tags: input.tags,
      });

      return {
        project,
        plan_id: planId,
        task: result.fm,
        task_index: result.taskIndex,
      };
    },
  };
}
