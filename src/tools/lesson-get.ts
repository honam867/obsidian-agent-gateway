import { z } from "zod";
import { getLesson } from "../domain/lesson.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({ repo: z.string().min(1), slug: z.string().min(1) });

export function lessonGetTool(_ctx: ToolContext): ToolDef {
  return {
    name: "lesson_get",
    description:
      "Read the full text of a per-repo lesson (symptom/cause/fix) by repo + slug. Use when a recall pointer signals a relevant past bug and you need the fix details.",
    annotations: { title: "Lesson Get", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo slug." },
        slug: { type: "string", description: "Lesson id." },
      },
      required: ["repo", "slug"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", summary: parsed.error.issues[0]?.message ?? "Invalid input", next_actions: ["Provide repo and slug."], artifacts: [] };
      }
      const lesson = await getLesson(parsed.data.repo, parsed.data.slug);
      if (!lesson) {
        return { status: "warning", summary: `No lesson ${parsed.data.repo}/${parsed.data.slug}`, next_actions: ["Check the slug or list via agent_recall."], artifacts: [] };
      }
      return {
        status: "success",
        summary: `Lesson ${parsed.data.repo}/${lesson.data.id}`,
        next_actions: ["Apply the fix; if it recurs, lesson_save reinforces it."],
        artifacts: [`repos/${parsed.data.repo}/lessons/${lesson.data.id}.md`],
        data: { frontmatter: lesson.data, content: lesson.content },
      };
    },
  };
}
