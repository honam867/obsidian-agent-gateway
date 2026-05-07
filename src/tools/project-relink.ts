import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { relinkProjectGraph } from "../domain/plan.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  plan_id: z.string().optional(),
});

export function projectRelinkTool(_ctx: ToolContext): ToolDef {
  return {
    name: "project_relink",
    description:
      "Rebuild managed Obsidian wikilink blocks for a project's project hub, plan hubs, and task files. Also migrates legacy project.md / plan.md notes to graph-friendly filenames and removes legacy sessions folders. Pass plan_id to limit relinking to one plan; omit to relink every plan in the project.",
    annotations: {
      title: "Project Relink",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Absolute path to the project root." },
        plan_id: {
          type: "string",
          description: "Optional plan id. Defaults to all plans for the resolved project.",
        },
      },
      required: ["cwd"],
    },
    handler: async (raw) => {
      const input = Input.parse(raw);
      const project = await resolveOrRegisterProject(path.resolve(input.cwd));
      const result = await relinkProjectGraph(project.slug, input.plan_id);
      return { project, plan_id: input.plan_id ?? null, relinked: result };
    },
  };
}
