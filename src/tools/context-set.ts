import { z } from "zod";
import { resolveFeature } from "../domain/feature.js";
import { recordFeatureActivity } from "../domain/recency.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  feature: z.string().min(1),
  title: z.string().optional(),
  repos: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
});

export function contextSetTool(_ctx: ToolContext): ToolDef {
  return {
    name: "context_set",
    description:
      "Set or create the active feature/initiative (a cross-repo label, e.g. 'misa-payout'). Resolves the feature, merging in any repos/paths provided. Call this when starting work on a feature so later memory tools know the scope.",
    annotations: { title: "Context Set", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", description: "Feature slug/label, e.g. 'misa-payout'." },
        title: { type: "string", description: "Human-readable title (defaults to the feature label)." },
        repos: { type: "array", items: { type: "string" }, description: "Repo slugs this feature spans." },
        paths: { type: "array", items: { type: "string" }, description: "Relevant paths inside the repos." },
      },
      required: ["feature"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide a non-empty 'feature'."], artifacts: [] };
      }
      const input = parsed.data;
      const feature = await resolveFeature({
        slug: input.feature,
        title: input.title,
        repos: input.repos,
        paths: input.paths,
      });
      await recordFeatureActivity(feature.slug);
      return {
        status: "success",
        summary: `Active feature: ${feature.slug} (${feature.repos.length} repo(s))`,
        next_actions: ["Call progress_update as you work", "Call memory_recall to load context"],
        artifacts: [`features/${feature.slug}/_feature.md`],
        data: { feature },
      };
    },
  };
}
