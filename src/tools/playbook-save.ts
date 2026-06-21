import { z } from "zod";
import { savePlaybook } from "../domain/playbook.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  repo: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  steps: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export function playbookSaveTool(_ctx: ToolContext): ToolDef {
  return {
    name: "playbook_save",
    description:
      "Save a per-repo reusable procedure/pattern/business-rule so it can be repeated exactly next time. ASK THE USER FIRST (this captures a 'do it the same way' commitment) — typically after a lesson recurs or the user says a method is reusable. Re-saving the same slug reinforces it.",
    annotations: { title: "Playbook Save", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo slug." },
        slug: { type: "string", description: "Stable id, e.g. 'run-script-safely'." },
        title: { type: "string", description: "Short title." },
        steps: { type: "string", description: "The procedure, in markdown (ordered steps)." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["repo", "slug", "title", "steps"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide repo, slug, title, steps."], artifacts: [] };
      }
      const input = parsed.data;
      const playbook = await savePlaybook(input);
      return {
        status: "success",
        summary: `Playbook saved: ${input.repo}/${playbook.id} (conf ${playbook.confidence})`,
        next_actions: ["Loaded next session via agent_recall so it can be reused verbatim"],
        artifacts: [`repos/${input.repo}/playbooks/${playbook.id}.md`],
        data: { playbook },
      };
    },
  };
}
