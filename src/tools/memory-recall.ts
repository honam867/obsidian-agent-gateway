import { z } from "zod";
import { recall } from "../domain/recall.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  instinct_limit: z.number().int().positive().optional(),
});

export function memoryRecallTool(_ctx: ToolContext): ToolDef {
  return {
    name: "memory_recall",
    description:
      "Load the working context for a feature: last progress (what you did / next step), knowledge pointers for its repos, and top global instincts. Call this FIRST when resuming a feature instead of re-reading the codebase.",
    annotations: { title: "Memory Recall", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug, e.g. 'misa-payout'." },
        instinct_limit: { type: "integer", minimum: 1, description: "Max instincts to return (default 5)." },
      },
      required: ["feature"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide a non-empty 'feature'."], artifacts: [] };
      }
      const bundle = await recall(parsed.data.feature, { instinctLimit: parsed.data.instinct_limit });
      const summary = bundle.feature
        ? `${bundle.feature.slug}: ${bundle.progress ? "has progress" : "no progress yet"}, ${bundle.knowledge.length} knowledge, ${bundle.instincts.length} instincts`
        : `Unknown feature; returning ${bundle.instincts.length} global instincts`;
      return {
        status: bundle.feature ? "success" : "warning",
        summary,
        next_actions: bundle.feature
          ? ["Read progress.next_step", "Pull full knowledge with memory_get if needed"]
          : ["Call context_set to create the feature"],
        artifacts: bundle.feature ? [`features/${bundle.feature.slug}/working/current.md`] : [],
        data: bundle,
      };
    },
  };
}
