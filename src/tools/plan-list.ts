import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { listPlans } from "../domain/plan.js";
import { PlanStatus } from "../schemas/plan.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  status: PlanStatus.optional(),
});

export function planListTool(_ctx: ToolContext): ToolDef {
  return {
    name: "plan_list",
    description:
      "List plans for the current project. Filter by status if needed (draft | active | archived).",
    annotations: {
      title: "List Plans",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        status: { type: "string", enum: ["draft", "active", "archived"] },
      },
      required: ["cwd"],
    },
    handler: async (raw) => {
      const input = Input.parse(raw);
      const project = await resolveOrRegisterProject(path.resolve(input.cwd));
      const plans = await listPlans(project.slug, input.status ? { status: input.status } : undefined);
      return { project, plans };
    },
  };
}
