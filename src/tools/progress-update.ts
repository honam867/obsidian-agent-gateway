import { z } from "zod";
import { writeProgress } from "../domain/working.js";
import { recordFeatureActivity } from "../domain/recency.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  last_action: z.string().min(1),
  next_step: z.string().min(1),
  active_task: z.string().optional(),
  session: z.string().optional(),
});

export function progressUpdateTool(_ctx: ToolContext): ToolDef {
  return {
    name: "progress_update",
    description:
      "Record what you just did and what's next for a feature (overwrites working/current.md). Call this at phase boundaries and before context runs out, so the next session knows where you stopped.",
    annotations: { title: "Progress Update", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug, e.g. 'misa-payout'." },
        last_action: { type: "string", description: "What you just did." },
        next_step: { type: "string", description: "The next concrete step." },
        active_task: { type: "string", description: "Optional task id you're on." },
        session: { type: "string", description: "Optional CLI session id." },
      },
      required: ["feature", "last_action", "next_step"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide feature, last_action, next_step."], artifacts: [] };
      }
      const input = parsed.data;
      const progress = await writeProgress({
        feature: input.feature,
        lastAction: input.last_action,
        nextStep: input.next_step,
        activeTask: input.active_task,
        session: input.session,
      });
      await recordFeatureActivity(progress.feature);
      return {
        status: "success",
        summary: `Progress saved for ${input.feature}`,
        next_actions: ["Continue working", "memory_recall next session to resume"],
        artifacts: [`features/${input.feature}/working/current.md`],
        data: { progress },
      };
    },
  };
}
