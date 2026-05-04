import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { getActivePlan } from "../domain/plan.js";
import { getTask, submitReview } from "../domain/task.js";
import { ReviewVerdict } from "../schemas/task.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  task_id: z.string().min(1),
  plan_id: z.string().optional(),
  verdict: z.enum(["approved", "changes_requested"]),
  feedback: z.string().min(1),
  session: z.string().nullable().optional(),
  expected_version: z.number().int().nonnegative().optional(),
});

export function reviewSubmitTool(_ctx: ToolContext): ToolDef {
  return {
    name: "review_submit",
    description:
      "Submit a review for a task. Writes verdict (approved / changes_requested) and feedback as a ## Review section directly in the task file. The coder reads it via task_get. agent_boot surfaces tasks with changes_requested in the needs_revision bucket.",
    annotations: {
      title: "Submit Review",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Absolute path to the project root." },
        task_id: { type: "string", description: "Task id (e.g. '001-schema')." },
        plan_id: {
          type: "string",
          description: "Optional — defaults to the project's active plan.",
        },
        verdict: {
          type: "string",
          enum: ["approved", "changes_requested"],
          description:
            "approved: task is good to merge/close. changes_requested: coder must revise before proceeding.",
        },
        feedback: {
          type: "string",
          description:
            "Full review feedback in markdown. Replaces any previous ## Review section in the task file.",
        },
        session: {
          type: "string",
          description: "Reviewer session id — stored for audit trail.",
        },
        expected_version: {
          type: "number",
          description: "Optimistic-concurrency guard. Fails if task version has changed.",
        },
      },
      required: ["cwd", "task_id", "verdict", "feedback"],
    },
    handler: async (raw) => {
      const input = Input.parse(raw);
      const project = await resolveOrRegisterProject(path.resolve(input.cwd));

      let planId = input.plan_id;
      if (!planId) {
        const plan = await getActivePlan(project.slug);
        if (!plan) throw new Error("No active plan for project; pass plan_id explicitly.");
        planId = plan.id;
      }

      const existing = await getTask(project.slug, planId, input.task_id);
      if (!existing) throw new Error(`Task not found: ${input.task_id}`);

      const updated = await submitReview(project.slug, planId, input.task_id, {
        verdict: input.verdict as ReviewVerdict,
        feedback: input.feedback,
        session: input.session ?? null,
        expectedVersion: input.expected_version,
      });

      return {
        project,
        plan_id: planId,
        task: updated,
        verdict: input.verdict,
        message:
          input.verdict === "approved"
            ? "Task approved. Coder can mark it done via /obsidian-plan-done."
            : "Review submitted. Coder will see feedback via task_get or in the needs_revision bucket of agent_boot.",
      };
    },
  };
}
