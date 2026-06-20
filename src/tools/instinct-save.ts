import { z } from "zod";
import { saveInstinct } from "../domain/instinct.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  trigger: z.string().min(1),
  action: z.string().min(1),
  why: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export function instinctSaveTool(_ctx: ToolContext): ToolDef {
  return {
    name: "instinct_save",
    description:
      "Save a self-improvement instinct about HOW you should work (cross-project, global). Use when you hit friction and found a better way. Re-saving the same slug reinforces it (confidence up). Format: trigger -> action -> why.",
    annotations: { title: "Instinct Save", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Stable id, e.g. 'forward-slash-paths'." },
        title: { type: "string", description: "Short title." },
        trigger: { type: "string", description: "When this applies." },
        action: { type: "string", description: "What to do." },
        why: { type: "string", description: "Why it works." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["slug", "title", "trigger", "action", "why"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide slug, title, trigger, action, why."], artifacts: [] };
      }
      const input = parsed.data;
      const instinct = await saveInstinct(input);
      return {
        status: "success",
        summary: `Instinct '${instinct.id}' saved (confidence ${instinct.confidence}, ${instinct.observations} obs)`,
        next_actions: ["Top instincts load via memory_recall next session"],
        artifacts: [`global/instincts/${instinct.id}.md`],
        data: { instinct },
      };
    },
  };
}
