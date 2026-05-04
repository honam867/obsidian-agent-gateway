import path from "node:path";
import { z } from "zod";
import { resolveOrRegisterProject } from "../domain/project.js";
import { getActivePlan, listPlans } from "../domain/plan.js";
import { listTasks } from "../domain/task.js";
import { hoursBetween, isSameLocalDay, nowIso } from "../utils/time.js";
import type { ToolContext, ToolDef } from "./types.js";

const Input = z.object({
  cwd: z.string().min(1),
  agent: z
    .object({
      name: z.string().optional(),
      cli: z.string().optional(),
      session: z.string().optional(),
      role: z.enum(["planner", "coder", "reviewer", "observer"]).optional(),
    })
    .optional(),
});

export function agentBootTool(ctx: ToolContext): ToolDef {
  return {
    name: "agent_boot",
    description:
      "Call this FIRST in every session. Resolves the project from the given cwd, auto-registers it if new, and returns the full working context: active plan, open / in-progress tasks, stale tasks (>24h), and recent audit events. Safe to cache the result for 5-10 minutes inside a CLI session.",
    annotations: {
      title: "Agent Boot",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        cwd: {
          type: "string",
          description:
            "Absolute path to the project root (usually the CLI's current working directory).",
        },
        agent: {
          type: "object",
          description: "Optional identification of the calling agent. Used only for audit logs.",
          properties: {
            name: { type: "string" },
            cli: { type: "string", description: "e.g. 'claude-code', 'codex', 'opencode'" },
            session: { type: "string", description: "Session id managed by the CLI." },
            role: { type: "string", enum: ["planner", "coder", "reviewer", "observer"] },
          },
        },
      },
      required: ["cwd"],
    },
    handler: async (raw) => {
      const input = Input.parse(raw);
      const project = await resolveOrRegisterProject(path.resolve(input.cwd));

      const plan = await getActivePlan(project.slug);
      if (!plan) {
        return {
          project,
          active_plan: null,
          my_active_tasks: [],
          open_tasks: [],
          in_progress_tasks: [],
          stale_tasks: [],
          recent_activity: [],
          hints: [
            "No active plan yet. Ask the planner (usually Claude Code) to run /obsidian-plan-create.",
          ],
          cache_until: addMinutes(5),
          tz: ctx.config.tz,
        };
      }

      const allTasks = await listTasks(project.slug, plan.id);
      const now = new Date().toISOString();
      const session = input.agent?.session ?? null;

      const mine = session ? allTasks.filter((t) => t.session === session) : [];
      const inProgress = allTasks.filter((t) => t.status === "in_progress");
      const open = allTasks.filter((t) => t.status === "active");
      const stale = inProgress.filter((t) => hoursBetween(t.updated_at, now) > 24);
      const needsRevision = allTasks.filter((t) => t.review_verdict === "changes_requested");
      const todayActivity = allTasks
        .filter((t) => isSameLocalDay(t.updated_at, ctx.config.tz))
        .slice(0, 10);

      return {
        project,
        active_plan: {
          id: plan.id,
          title: plan.title,
          status: plan.status,
          version: plan.version,
          created_at: plan.created_at,
          updated_at: plan.updated_at,
          task_counts: countsByStatus(allTasks),
        },
        my_active_tasks: mine,
        open_tasks: open,
        in_progress_tasks: inProgress,
        stale_tasks: stale,
        needs_revision: needsRevision,
        recent_activity: todayActivity,
        hints: buildHints({ open, inProgress, stale, mine, needsRevision }),
        cache_until: addMinutes(5),
        tz: ctx.config.tz,
      };
    },
  };
}

function countsByStatus(tasks: { status: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  return counts;
}

function addMinutes(mins: number): string {
  return new Date(Date.now() + mins * 60_000).toISOString();
}

function buildHints(groups: {
  open: unknown[];
  inProgress: unknown[];
  stale: unknown[];
  mine: unknown[];
  needsRevision: unknown[];
}): string[] {
  const hints: string[] = [];
  if (groups.needsRevision.length > 0) {
    hints.push(
      `${groups.needsRevision.length} task(s) have review feedback requesting changes. Call task_get on each to read the ## Review section.`,
    );
  }
  if (groups.inProgress.length === 0 && groups.open.length > 0) {
    hints.push(
      "No task is in progress. Pick one from open_tasks and call /obsidian-plan-start <task-id>.",
    );
  }
  if (groups.stale.length > 0) {
    hints.push(
      `${groups.stale.length} task(s) have been in_progress for more than 24h. Consider finishing or blocking them.`,
    );
  }
  if (groups.mine.length > 0) {
    hints.push(`You still have ${groups.mine.length} task(s) claimed by your previous session.`);
  }
  return hints;
}
