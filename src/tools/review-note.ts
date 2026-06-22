import { z } from "zod";
import { resolveReviewSlug, setReviewFeedback } from "../domain/review.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  kind: z.enum(["spec", "plan"]),
  feedback: z.string().min(1),
  slug: z.string().optional(),
});

export function reviewNoteTool(_ctx: ToolContext): ToolDef {
  return {
    name: "review_note",
    description:
      "Write review feedback for a spec/plan under review (OVERWRITES the previous feedback — latest only, no history). Use after reading the document at its path. The other CLI reads this via review_get — no copy-paste. Omit slug if the feature has a single record of that kind.",
    annotations: { title: "Review Note", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug." },
        kind: { type: "string", enum: ["spec", "plan"] },
        feedback: { type: "string", description: "The review feedback (overwrites the previous)." },
        slug: { type: "string", description: "Optional; needed only if several records of that kind exist." },
      },
      required: ["feature", "kind", "feedback"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide feature, kind, feedback."], artifacts: [] };
      }
      const { feature, kind, feedback, slug } = parsed.data;
      const resolved = await resolveReviewSlug(feature, kind, slug);
      if (!resolved) {
        return { status: "warning", summary: `No single ${kind} review for ${feature}`, next_actions: ["Pass an explicit slug, or review_open first."], artifacts: [] };
      }
      const review = await setReviewFeedback(feature, kind, resolved, feedback);
      return {
        status: "success",
        summary: `Feedback saved: ${feature}/${kind}-${resolved} (reviewing)`,
        next_actions: ["The author CLI reads it via review_get"],
        artifacts: [`features/${feature}/reviews/${kind}-${resolved}.md`],
        data: { review },
      };
    },
  };
}
