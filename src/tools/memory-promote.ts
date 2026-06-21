import { z } from "zod";
import { promoteLessonToInstinct } from "../domain/promote.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({ repo: z.string().min(1), lesson_slug: z.string().min(1) });

export function memoryPromoteTool(_ctx: ToolContext): ToolDef {
  return {
    name: "memory_promote",
    description:
      "Promote a recurring per-repo lesson into a GLOBAL instinct (applies across all repos). ASK THE USER FIRST. Use when the same lesson keeps applying beyond its repo — the lesson's symptom/cause/fix become an instinct trigger/why/action.",
    annotations: { title: "Memory Promote", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo slug the lesson belongs to." },
        lesson_slug: { type: "string", description: "The lesson id to promote." },
      },
      required: ["repo", "lesson_slug"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide repo and lesson_slug."], artifacts: [] };
      }
      const instinct = await promoteLessonToInstinct(parsed.data.repo, parsed.data.lesson_slug);
      if (!instinct) {
        return { status: "warning", summary: `No lesson ${parsed.data.repo}/${parsed.data.lesson_slug} to promote`, next_actions: ["Check the lesson slug."], artifacts: [] };
      }
      return {
        status: "success",
        summary: `Promoted to global instinct '${instinct.id}' (conf ${instinct.confidence})`,
        next_actions: ["Loaded for every project via agent_recall top instincts"],
        artifacts: [`global/instincts/${instinct.id}.md`],
        data: { instinct },
      };
    },
  };
}
