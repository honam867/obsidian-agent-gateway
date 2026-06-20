import { z } from "zod";
import { agentRecall } from "../domain/agent-recall.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  instinct_limit: z.number().int().positive().optional(),
});

export function agentRecallTool(_ctx: ToolContext): ToolDef {
  return {
    name: "agent_recall",
    description:
      "Call this FIRST in a session (or when the user asks 'what was I doing / continue / which repo'). Pass your current working directory; the server resolves the repo + the feature you last worked on there, and returns the working context (last action, next step, knowledge, instincts) so you don't re-read the codebase. You do not need to know the feature slug.",
    annotations: { title: "Agent Recall", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Absolute path of the session's current working directory." },
        instinct_limit: { type: "integer", minimum: 1, description: "Max instincts to return (default 5)." },
      },
      required: ["cwd"],
    },
    handler: async (raw) => {
      const parsed = Input.safeParse(raw);
      if (!parsed.success) {
        return {
          status: "error",
          summary: parsed.error.issues[0]?.message ?? "Invalid input",
          next_actions: ["Provide a non-empty 'cwd'."],
          artifacts: [],
        };
      }
      const result = await agentRecall(parsed.data.cwd, { instinctLimit: parsed.data.instinct_limit });
      const { resolved, recall } = result;
      if (resolved.how === "none") {
        return {
          status: "warning",
          summary: "No feature to resume yet for this location.",
          next_actions: ["Call context_set to start a feature, then progress_update as you work."],
          artifacts: [],
          data: result,
        };
      }
      const summary =
        `Resumed ${resolved.feature}` +
        (resolved.repo ? ` (repo ${resolved.repo}, ${resolved.how})` : ` (${resolved.how})`) +
        (recall.progress ? `: ${recall.progress.last_action}` : ": no progress yet");
      return {
        status: "success",
        summary,
        next_actions: ["Read recall.progress.next_step", "context_set if you switch feature"],
        artifacts: resolved.feature ? [`features/${resolved.feature}/working/current.md`] : [],
        data: result,
      };
    },
  };
}
