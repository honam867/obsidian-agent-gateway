import { z } from "zod";
import { resolveReviewSlug, getReview } from "../domain/review.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  kind: z.enum(["spec", "plan"]),
  slug: z.string().optional(),
});

export function reviewGetTool(_ctx: ToolContext): ToolDef {
  return {
    name: "review_get",
    description:
      "Read a spec/plan review record: its state and the latest feedback. Call this to pull review feedback without copy-paste before revising the document. Omit slug if the feature has a single record of that kind.",
    annotations: { title: "Review Get", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
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
        return { status: "warning", summary: `No single ${kind} review for ${feature}`, next_actions: ["Pass an explicit slug, or review_open first."], artifacts: [] };
      }
      const review = await getReview(feature, kind, resolved);
      if (!review) {
        return { status: "warning", summary: `Review not found: ${feature}/${kind}-${resolved}`, next_actions: ["Check the slug."], artifacts: [] };
      }
      return {
        status: "success",
        summary: `Review ${feature}/${kind}-${resolved} (${review.data.state})`,
        next_actions: review.data.state === "reviewing" ? ["Revise the doc at review.data.path, then ask to re-review"] : ["Approved — proceed"],
        artifacts: [`features/${feature}/reviews/${kind}-${resolved}.md`],
        data: { frontmatter: review.data, content: review.content },
      };
    },
  };
}
