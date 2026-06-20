import { z } from "zod";
import { saveKnowledge } from "../domain/knowledge.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  repo: z.string().min(1),
  area: z.string().min(1),
  body: z.string().min(1),
  source_paths: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export function knowledgeSaveTool(_ctx: ToolContext): ToolDef {
  return {
    name: "knowledge_save",
    description:
      "Save a durable codebase fact for a repo (architecture, convention, gotcha, run/test command). Keyed by repo + area, upserted. Record only high-signal facts, not raw output.",
    annotations: { title: "Knowledge Save", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo slug, e.g. 'cozrum-server'." },
        area: { type: "string", description: "Topic/area, e.g. 'misa-prepare'." },
        body: { type: "string", description: "The fact, in markdown." },
        source_paths: { type: "array", items: { type: "string" }, description: "Files this fact is about." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["repo", "area", "body"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide repo, area, body."], artifacts: [] };
      }
      const input = parsed.data;
      const knowledge = await saveKnowledge({
        repo: input.repo,
        area: input.area,
        body: input.body,
        sourcePaths: input.source_paths,
        tags: input.tags,
      });
      return {
        status: "success",
        summary: `Knowledge saved: ${input.repo}/${knowledge.id}`,
        next_actions: ["memory_recall surfaces this as a pointer next session"],
        artifacts: [`repos/${input.repo}/knowledge/${knowledge.id}.md`],
        data: { knowledge },
      };
    },
  };
}
