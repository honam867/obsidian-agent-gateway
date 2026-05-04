import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { editTask, getActivePlan } from "../domain/plan.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  task_id: z.string().min(1),
  plan_id: z.string().optional(),
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  expected_version: z.number().int().nonnegative().optional(),
});

export function taskEditTool(_ctx: ToolContext): ToolDef {
  return {
    name: "task_edit",
    description:
      "Edit a task's content fields: title, body, depends_on, tags. Task ID and status are unchanged. If title changes, the plan TOC is rebuilt. Use task_update for status/session/note changes.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        task_id: { type: "string", description: "Task id to edit, e.g. '002-api-endpoints'." },
        plan_id: {
          type: "string",
          description: "Plan id. Defaults to the project's current active plan.",
        },
        title: { type: "string", description: "New title. Task ID (filename) stays the same." },
        content: {
          type: "string",
          description:
            "Replaces the entire task body. Markdown is fine. If omitted, body is unchanged.",
        },
        depends_on: {
          type: "array",
          items: { type: "string" },
          description: "Replaces the full depends_on list. Pass [] to clear.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Replaces the full tags list. Pass [] to clear.",
        },
        expected_version: {
          type: "number",
          description:
            "Optimistic-concurrency guard. If provided and mismatched, the update is rejected.",
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

      const updated = await editTask(project.slug, planId, input.task_id, {
        title: input.title,
        content: input.content,
        dependsOn: input.depends_on,
        tags: input.tags,
        expectedVersion: input.expected_version,
      });

      return { project, plan_id: planId, task: updated };
    },
  };
}
