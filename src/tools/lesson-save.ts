import { z } from "zod";
import { saveLesson } from "../domain/lesson.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  repo: z.string().min(1),
  slug: z.string().min(1),
  symptom: z.string().min(1),
  cause: z.string().min(1),
  fix: z.string().min(1),
  source_paths: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export function lessonSaveTool(ctx: ToolContext): ToolDef {
  return {
    name: "lesson_save",
    description:
      "Save a per-repo lesson after you fix a bug/incident (symptom -> cause -> fix). AUTO: call it whenever you solve a repo-specific problem worth not re-discovering. Re-saving the same slug reinforces it; once it recurs, the response will suggest capturing a reusable playbook or promoting it.",
    annotations: { title: "Lesson Save", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo slug, e.g. 'cozrum-server'." },
        slug: { type: "string", description: "Stable id for this lesson, e.g. 'cash-remap-null'." },
        symptom: { type: "string", description: "What went wrong (the observable problem)." },
        cause: { type: "string", description: "Root cause." },
        fix: { type: "string", description: "How it was fixed (so next time you skip the discovery)." },
        source_paths: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["repo", "slug", "symptom", "cause", "fix"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide repo, slug, symptom, cause, fix."], artifacts: [] };
      }
      const input = parsed.data;
      const lesson = await saveLesson({
        repo: input.repo,
        slug: input.slug,
        symptom: input.symptom,
        cause: input.cause,
        fix: input.fix,
        sourcePaths: input.source_paths,
        tags: input.tags,
      });
      const threshold = ctx.config.learnThreshold ?? 2;
      const next_actions = ["Loaded automatically next session via agent_recall"];
      if (lesson.observations >= threshold) {
        next_actions.unshift(
          `This lesson recurred ${lesson.observations}×. Ask the user whether to capture it as a reusable playbook (playbook_save) or promote it to a global instinct (memory_promote).`,
        );
      }
      return {
        status: "success",
        summary: `Lesson saved: ${input.repo}/${lesson.id} (obs ${lesson.observations}, conf ${lesson.confidence})`,
        next_actions,
        artifacts: [`repos/${input.repo}/lessons/${lesson.id}.md`],
        data: { lesson },
      };
    },
  };
}
