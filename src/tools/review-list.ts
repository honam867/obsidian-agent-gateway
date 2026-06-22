import { z } from "zod";
import { listReviews } from "../domain/review.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  state: z.enum(["reviewing", "approved"]).optional(),
});

export function reviewListTool(_ctx: ToolContext): ToolDef {
  return {
    name: "review_list",
    description:
      "List spec/plan review records across all features (optionally filtered by state, e.g. 'reviewing'). Use this when the user asks 'which spec/plan needs review?' — it finds pending items + their paths through the shared vault, so you never copy a path.",
    annotations: { title: "Review List", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["reviewing", "approved"], description: "Optional filter." },
      },
      required: [],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["state must be 'reviewing' or 'approved'."], artifacts: [] };
      }
      const reviews = await listReviews(parsed.data.state);
      return {
        status: "success",
        summary: `${reviews.length} review record(s)${parsed.data.state ? ` in ${parsed.data.state}` : ""}`,
        next_actions: reviews.length ? ["Open a doc at its path, then review_note / review_get"] : ["Nothing pending"],
        artifacts: [],
        data: { reviews },
      };
    },
  };
}
