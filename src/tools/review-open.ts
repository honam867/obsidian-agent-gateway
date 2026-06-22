import { z } from "zod";
import { openReview } from "../domain/review.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  kind: z.enum(["spec", "plan"]),
  path: z.string().min(1),
});

export function reviewOpenTool(_ctx: ToolContext): ToolDef {
  return {
    name: "review_open",
    description:
      "Register a spec/plan document for review (state: reviewing). Call this after you produce a spec or plan, so another CLI can find and review it through the shared vault — no copy-paste of the path. Re-opening the same document overwrites its record (no new file).",
    annotations: { title: "Review Open", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug the spec/plan belongs to." },
        kind: { type: "string", enum: ["spec", "plan"], description: "spec | plan." },
        path: { type: "string", description: "Absolute path to the spec/plan document." },
      },
      required: ["feature", "kind", "path"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide feature, kind, path."], artifacts: [] };
      }
      const review = await openReview(parsed.data);
      return {
        status: "success",
        summary: `Review opened: ${review.feature}/${review.kind}-${review.slug} (reviewing)`,
        next_actions: ["Another CLI can find it via review_list('reviewing')"],
        artifacts: [`features/${review.feature}/reviews/${review.kind}-${review.slug}.md`],
        data: { review },
      };
    },
  };
}
