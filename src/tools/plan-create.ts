import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { createPlan } from "../domain/plan.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export function planCreateTool(ctx: ToolContext): ToolDef {
  return {
    name: "plan_create",
    description:
      "Create a new active plan for the project identified by `cwd`. If an active plan already exists, it is archived. Long content is auto-broken into tasks by H2/H3 headings or '## Task:' markers. Thresholds come from config (default 800 / 2000 lines).",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Absolute path to the project root." },
        title: { type: "string", description: "Short human-readable plan title." },
        content: {
          type: "string",
          description:
            "Full markdown content of the plan. Use H2 headings per task for auto-breakdown.",
        },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["cwd", "title", "content"],
    },
    handler: async (raw) => {
      const input = Input.parse(raw);
      const project = await resolveOrRegisterProject(path.resolve(input.cwd));
      const result = await createPlan(
        {
          projectSlug: project.slug,
          title: input.title,
          content: input.content,
          tags: input.tags,
        },
        ctx.config,
      );
      return {
        project,
        plan: result.plan,
        task_ids: result.taskIds,
        strategy: result.strategy,
        warning: result.warning ?? null,
      };
    },
  };
}
