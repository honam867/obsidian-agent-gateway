import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { setPlanStatus } from "../domain/plan.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  plan_id: z.string().min(1),
  reason: z.string().optional(),
});

export function planArchiveTool(_ctx: ToolContext): ToolDef {
  return {
    name: "plan_archive",
    description:
      "Archive a plan. The plan's tasks are left intact but the plan will no longer show up as active in agent_boot.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        plan_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["cwd", "plan_id"],
    },
    handler: async (raw) => {
      const input = Input.parse(raw);
      const project = await resolveOrRegisterProject(path.resolve(input.cwd));
      await setPlanStatus(project.slug, input.plan_id, "archived", input.reason);
      return { ok: true, project, plan_id: input.plan_id };
    },
  };
}
