import type { PlanFrontmatter } from "../schemas/plan.js";
import type { TaskFrontmatter } from "../schemas/task.js";

const LINK_BLOCK_START = "<!-- agent-gateway-links:start -->";
const LINK_BLOCK_END = "<!-- agent-gateway-links:end -->";

export const TASK_STATUS_LINKS = ["draft", "active", "in_progress", "blocked", "done"] as const;
export const PLAN_STATUS_LINKS = ["draft", "active", "archived"] as const;

function wikiPath(target: string, label?: string): string {
  const normalized = target.replace(/\\/g, "/").replace(/\.md$/i, "");
  return label && label !== normalized ? `[[${normalized}|${label}]]` : `[[${normalized}]]`;
}

export function projectLink(projectSlug: string): string {
  return wikiPath(`projects/${projectSlug}/${projectSlug}`, projectSlug);
}

export function planLink(projectSlug: string, planId: string, label = planId): string {
  return wikiPath(`projects/${projectSlug}/plans/${planId}/${planId}`, label);
}

export function taskLink(
  projectSlug: string,
  planId: string,
  taskId: string,
  label = taskId,
): string {
  return wikiPath(`projects/${projectSlug}/plans/${planId}/tasks/${taskId}`, label);
}

export function taskStatusLink(status: string): string {
  return wikiPath(`_index/status/${status}`, status);
}

export function planStatusLink(status: string): string {
  return wikiPath(`_index/plan-status/${status}`, status);
}

export function upsertManagedLinks(body: string, lines: string[]): string {
  const block = [LINK_BLOCK_START, "## Links", "", ...lines, LINK_BLOCK_END].join("\n");
  const withoutOld = stripManagedLinks(body).trimStart();
  const bodyLines = withoutOld.split(/\r?\n/);

  if (bodyLines[0]?.startsWith("# ")) {
    const [heading, ...rest] = bodyLines;
    const restBody = rest.join("\n").trimStart();
    return [heading, "", block, ...(restBody ? ["", restBody] : [])].join("\n").trimEnd() + "\n";
  }

  return [block, ...(withoutOld ? ["", withoutOld] : [])].join("\n").trimEnd() + "\n";
}

export function stripManagedLinks(body: string): string {
  const pattern = new RegExp(
    `${escapeRegex(LINK_BLOCK_START)}[\\s\\S]*?${escapeRegex(LINK_BLOCK_END)}\\s*`,
    "g",
  );
  return body.replace(pattern, "");
}

export function upsertTaskLinks(body: string, task: TaskFrontmatter): string {
  const dependencies =
    task.depends_on.length > 0
      ? task.depends_on.map((id) => taskLink(task.project, task.plan, id, id)).join(", ")
      : "_None_";

  return upsertManagedLinks(body, [
    `- Project: ${projectLink(task.project)}`,
    `- Plan: ${planLink(task.project, task.plan, task.plan)}`,
    `- Status: ${taskStatusLink(task.status)}`,
    `- Depends on: ${dependencies}`,
  ]);
}

export function planLinkLines(plan: PlanFrontmatter): string[] {
  return [
    `- Project: ${projectLink(plan.project)}`,
    `- Status: ${planStatusLink(plan.status)}`,
  ];
}

export function projectLinkLines(args: {
  projectSlug: string;
  plans: Pick<PlanFrontmatter, "id" | "title" | "status" | "project">[];
}): string[] {
  const active = args.plans.filter((p) => p.status === "active");
  const archived = args.plans.filter((p) => p.status === "archived");
  const draft = args.plans.filter((p) => p.status === "draft");

  return [
    `- Project: ${projectLink(args.projectSlug)}`,
    `- Active plans: ${formatPlanList(active)}`,
    `- Draft plans: ${formatPlanList(draft)}`,
    `- Archived plans: ${formatPlanList(archived)}`,
  ];
}

function formatPlanList(plans: Pick<PlanFrontmatter, "id" | "title" | "project">[]): string {
  if (plans.length === 0) return "_None_";
  return plans.map((p) => planLink(p.project, p.id, p.title || p.id)).join(", ");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
