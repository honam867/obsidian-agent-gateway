import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { getPlan, listTaskRefs, renderPlanBody } from "../domain/plan.js";
import { getPaths, writeMarkdown } from "../vault/vault-io.js";
import { logEvent } from "../domain/audit.js";
import { nowIso } from "../utils/time.js";
import type { PlanFrontmatter } from "../schemas/plan.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  plan_id: z.string().min(1),
  note: z.string().optional(),
  reason: z.string().optional(),
});

export function planReviseTool(_ctx: ToolContext): ToolDef {
  return {
    name: "plan_revise",
    description:
      "Bump the plan version and optionally attach a short revision note. Does NOT touch existing tasks — use when the plan's intent changes but the task breakdown is still valid. The plan body is a TOC of tasks; pass `note` (short) to attach a revision summary.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        plan_id: { type: "string" },
        note: {
          type: "string",
          description:
            "Optional short revision note stored at the bottom of the plan file. Keep it brief — task-level detail belongs in tasks.",
        },
        reason: { type: "string", description: "Reason logged to the audit trail." },
      },
      required: ["cwd", "plan_id"],
    },
    handler: async (raw) => {
      const input = Input.parse(raw);
      const project = await resolveOrRegisterProject(path.resolve(input.cwd));
      const parsed = await getPlan(project.slug, input.plan_id);
      if (!parsed) throw new Error(`Plan not found: ${input.plan_id}`);
      const next: PlanFrontmatter = {
        ...parsed.data,
        updated_at: nowIso(),
        version: parsed.data.version + 1,
      };
      const taskRefs = await listTaskRefs(project.slug, input.plan_id);
      const body = renderPlanBody({
        title: next.title,
        taskRefs,
        revisionNote: input.note ?? null,
      });
      await writeMarkdown(
        getPaths().planFile(project.slug, input.plan_id),
        next as unknown as Record<string, unknown>,
        body,
      );
      await logEvent(project.slug, input.plan_id, {
        event: "plan.revised",
        entity: "plan",
        entityId: input.plan_id,
        payload: { reason: input.reason ?? null, version: next.version },
      });
      return { project, plan: next };
    },
  };
}
