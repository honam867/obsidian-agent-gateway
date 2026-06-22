import { z } from "zod";
import { resolveReviewSlug, approveReview } from "../domain/review.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  kind: z.enum(["spec", "plan"]),
  slug: z.string().optional(),
});

export function reviewApproveTool(_ctx: ToolContext): ToolDef {
  return {
    name: "review_approve",
    description:
      "Mark a spec/plan review as approved (state: reviewing -> approved). The user triggers this when satisfied. Omit slug if the feature has a single record of that kind.",
    annotations: { title: "Review Approve", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug." },
        kind: { type: "string", enum: ["spec", "plan"] },
        slug: { type: "string", description: "Optional; needed only if several records of that kind exist." },
      },
      required: ["feature", "kind"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide feature and kind."], artifacts: [] };
      }
      const { feature, kind, slug } = parsed.data;
      const resolved = await resolveReviewSlug(feature, kind, slug);
      if (!resolved) {
        return { status: "warning", summary: `No single ${kind} review for ${feature}`, next_actions: ["Pass an explicit slug."], artifacts: [] };
      }
      const review = await approveReview(feature, kind, resolved);
      return {
        status: "success",
        summary: `Review approved: ${feature}/${kind}-${resolved}`,
        next_actions: kind === "spec" ? ["Proceed to write the plan"] : ["Proceed to implement"],
        artifacts: [`features/${feature}/reviews/${kind}-${resolved}.md`],
        data: { review },
      };
    },
  };
}
