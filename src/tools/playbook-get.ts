import { z } from "zod";
import { getPlaybook } from "../domain/playbook.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({ repo: z.string().min(1), slug: z.string().min(1) });

export function playbookGetTool(_ctx: ToolContext): ToolDef {
  return {
    name: "playbook_get",
    description:
      "Read the full steps of a per-repo playbook by repo + slug. Use when a recall pointer shows a relevant reusable procedure and you want to follow it exactly.",
    annotations: { title: "Playbook Get", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo slug." },
        slug: { type: "string", description: "Playbook id." },
      },
      required: ["repo", "slug"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide repo and slug."], artifacts: [] };
      }
      const playbook = await getPlaybook(parsed.data.repo, parsed.data.slug);
      if (!playbook) {
        return { status: "warning", summary: `No playbook ${parsed.data.repo}/${parsed.data.slug}`, next_actions: ["Check the slug."], artifacts: [] };
      }
      return {
        status: "success",
        summary: `Playbook ${parsed.data.repo}/${playbook.data.id}`,
        next_actions: ["Follow the steps; re-save (playbook_save) to reinforce after using it."],
        artifacts: [`repos/${parsed.data.repo}/playbooks/${playbook.data.id}.md`],
        data: { frontmatter: playbook.data, content: playbook.content },
      };
    },
  };
}
