import path from "node:path";
import { deleteFile, getPaths, listDirs, listFiles, readMarkdown, writeMarkdown } from "../vault/vault-io.js";
import { ensureDir, fileExists, moveFile, removeDir } from "../vault/atomic-write.js";
import { localDateSlug, nowIso } from "../utils/time.js";
import { planSlugFromTitle, taskIdFromIndex } from "../utils/slug.js";
import { breakdownPlan } from "../utils/breakdown.js";
import { PlanFrontmatter, PlanStatus } from "../schemas/plan.js";
import { TaskFrontmatter } from "../schemas/task.js";
import { ProjectFrontmatter } from "../schemas/project.js";
import type { Config } from "../config.js";
import { lookupBySlug } from "../vault/project-registry.js";
import { logEvent } from "./audit.js";
import {
  planLinkLines,
  projectLinkLines,
  taskLink,
  upsertManagedLinks,
  upsertTaskLinks,
} from "./obsidian-links.js";

export interface CreatePlanInput {
  projectSlug: string;
  title: string;
  content: string;
  tags?: string[];
}

export interface CreatePlanResult {
  plan: PlanFrontmatter;
  taskIds: string[];
  strategy: string;
  warning?: string;
}

async function getActivePlanIds(projectSlug: string): Promise<string[]> {
  const plansRoot = getPaths().plansDir(projectSlug);
  const planDirs = await listDirs(plansRoot);
  const active: string[] = [];
  for (const id of planDirs) {
    const parsed = await readMarkdown<PlanFrontmatter>(getPaths().planFile(projectSlug, id));
    if (parsed?.data.status === "active") active.push(id);
  }
  return active;
}

export async function createPlan(input: CreatePlanInput, cfg: Config): Promise<CreatePlanResult> {
  const { projectSlug, title, content } = input;
  const datePrefix = localDateSlug(cfg.tz);
  let planId = planSlugFromTitle(title, datePrefix);

  // Collision guard: if plan-id already exists, append a numeric suffix.
  const paths = getPaths();
  let suffix = 1;
  while (await fileExists(paths.planFile(projectSlug, planId))) {
    suffix += 1;
    planId = `${planSlugFromTitle(title, datePrefix)}-${suffix}`;
  }

  // Archive prior active plans (only one active at a time).
  for (const prior of await getActivePlanIds(projectSlug)) {
    await setPlanStatus(projectSlug, prior, "archived", "Superseded by new active plan");
  }

  const breakdown = breakdownPlan(content, {
    smallThreshold: cfg.breakdown.small,
    largeThreshold: cfg.breakdown.large,
  });

  const now = nowIso();
  const planFm: PlanFrontmatter = {
    id: planId,
    title,
    project: projectSlug,
    status: "active",
    created_at: now,
    updated_at: now,
    version: 1,
    breakdown_strategy: breakdown.strategy,
    tags: input.tags ?? [],
  };

  await ensureDir(paths.planDir(projectSlug, planId));
  await ensureDir(paths.tasksDir(projectSlug, planId));

  const taskRefs: { id: string; title: string }[] = [];
  for (let i = 0; i < breakdown.tasks.length; i++) {
    const t = breakdown.tasks[i];
    const taskId = taskIdFromIndex(i + 1, t.title);
    const fm: TaskFrontmatter = {
      id: taskId,
      title: t.title,
      project: projectSlug,
      plan: planId,
      status: "active",
      session: null,
      created_at: now,
      updated_at: now,
      started_at: null,
      completed_at: null,
      depends_on: [],
      tags: [],
      block_reason: null,
      version: 1,
      review_verdict: "none",
      review_session: null,
    };
    const taskBody = upsertTaskLinks(
      [`# ${t.title}`, "", t.content || "_No content provided._"].join("\n"),
      fm,
    );
    await writeMarkdown(
      paths.taskFile(projectSlug, planId, taskId),
      fm as unknown as Record<string, unknown>,
      taskBody,
    );
    taskRefs.push({ id: taskId, title: t.title });
  }
  const taskIds = taskRefs.map((t) => t.id);

  const body = renderPlanBody({ plan: planFm, taskRefs, warning: breakdown.warning });
  await writeMarkdown(paths.planFile(projectSlug, planId), planFm as unknown as Record<string, unknown>, body);

  await logEvent(projectSlug, planId, {
    event: "plan.created",
    entity: "plan",
    entityId: planId,
    payload: { title, taskCount: taskIds.length, strategy: breakdown.strategy },
  });
  await syncProjectGraphLinks(projectSlug);

  return { plan: planFm, taskIds, strategy: breakdown.strategy, warning: breakdown.warning };
}

export async function getPlan(projectSlug: string, planId: string) {
  return readMarkdown<PlanFrontmatter>(getPaths().planFile(projectSlug, planId));
}

export async function setPlanStatus(
  projectSlug: string,
  planId: string,
  status: PlanStatus,
  reason?: string,
): Promise<void> {
  const planFile = getPaths().planFile(projectSlug, planId);
  const parsed = await readMarkdown<PlanFrontmatter>(planFile);
  if (!parsed) throw new Error(`Plan not found: ${planId}`);
  const next: PlanFrontmatter = {
    ...parsed.data,
    status,
    updated_at: nowIso(),
    version: parsed.data.version + 1,
  };
  await writeMarkdown(
    planFile,
    next as unknown as Record<string, unknown>,
    upsertManagedLinks(parsed.content, planLinkLines(next)),
  );
  await logEvent(projectSlug, planId, {
    event: `plan.status.${status}`,
    entity: "plan",
    entityId: planId,
    payload: reason ? { reason } : {},
  });
  await syncProjectGraphLinks(projectSlug);
}

export async function getPlanById(
  projectSlug: string,
  planId: string,
): Promise<PlanFrontmatter | null> {
  const parsed = await readMarkdown<PlanFrontmatter>(getPaths().planFile(projectSlug, planId));
  return parsed?.data ?? null;
}

export async function listPlans(
  projectSlug: string,
  filter?: { status?: PlanStatus },
): Promise<PlanFrontmatter[]> {
  const planDirs = await listDirs(getPaths().plansDir(projectSlug));
  const out: PlanFrontmatter[] = [];
  for (const id of planDirs) {
    const parsed = await readMarkdown<PlanFrontmatter>(getPaths().planFile(projectSlug, id));
    if (!parsed) continue;
    if (filter?.status && parsed.data.status !== filter.status) continue;
    out.push(parsed.data);
  }
  const toTs = (v: unknown): number => {
    if (typeof v === "string") { const t = Date.parse(v); return Number.isNaN(t) ? 0 : t; }
    if (v instanceof Date) return v.getTime();
    if (typeof v === "number") return v;
    return 0;
  };
  return out.sort((a, b) => toTs(b.created_at) - toTs(a.created_at));
}

export async function getActivePlan(projectSlug: string): Promise<PlanFrontmatter | null> {
  const active = await listPlans(projectSlug, { status: "active" });
  return active[0] ?? null;
}

export async function getActivePlans(projectSlug: string): Promise<PlanFrontmatter[]> {
  return listPlans(projectSlug, { status: "active" });
}

/**
 * Resolve which plan a task belongs to.
 * If planId is given, use it directly (throws if not found).
 * Otherwise try the latest active plan first, then search all active plans.
 * This prevents "Task not found" when the task lives in a non-primary active plan.
 */
export async function resolveTaskPlan(
  projectSlug: string,
  taskId: string,
  planId?: string,
): Promise<string> {
  if (planId) {
    const plan = await getPlanById(projectSlug, planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    return planId;
  }

  const active = await getActivePlans(projectSlug);
  if (active.length === 0) throw new Error("No active plan for project; pass plan_id explicitly.");

  // Fast path: primary active plan
  const { getTask } = await import("./task.js");
  for (const plan of active) {
    const task = await getTask(projectSlug, plan.id, taskId);
    if (task) return plan.id;
  }

  throw new Error(
    `Task not found: ${taskId}. It does not exist in any active plan. Pass plan_id explicitly if the task belongs to an archived or draft plan.`,
  );
}

export function renderPlanBody(args: {
  plan: PlanFrontmatter;
  taskRefs: { id: string; title: string }[];
  warning?: string | null;
  revisionNote?: string | null;
}): string {
  const lines: string[] = [
    upsertManagedLinks(`# ${args.plan.title}\n`, planLinkLines(args.plan)).trimEnd(),
    "",
  ];
  if (args.taskRefs.length === 0) {
    lines.push("_No tasks yet._");
  } else {
    lines.push(`Tasks (${args.taskRefs.length}):`);
    args.taskRefs.forEach((t, i) => {
      lines.push(
        `${i + 1}. ${taskLink(args.plan.project, args.plan.id, t.id, t.title)} - \`${t.id}\``,
      );
    });
  }
  if (args.warning) {
    lines.push("", `> Warning: ${args.warning}`);
  }
  if (args.revisionNote && args.revisionNote.trim().length > 0) {
    lines.push("", "## Revision note", "", args.revisionNote.trim());
  }
  return lines.join("\n");
}

export interface AddTaskInput {
  title: string;
  content?: string;
  dependsOn?: string[];
  tags?: string[];
}

export interface AddTaskResult {
  taskId: string;
  fm: TaskFrontmatter;
  taskIndex: number;
}

export async function addTask(
  projectSlug: string,
  planId: string,
  input: AddTaskInput,
): Promise<AddTaskResult> {
  const paths = getPaths();

  const files = (await listFiles(paths.tasksDir(projectSlug, planId), ".md")).slice().sort();
  let maxIndex = 0;
  for (const f of files) {
    const m = f.match(/^(\d+)-/);
    if (m) maxIndex = Math.max(maxIndex, parseInt(m[1], 10));
  }
  const taskIndex = maxIndex + 1;

  const taskId = taskIdFromIndex(taskIndex, input.title);
  const now = nowIso();

  const fm: TaskFrontmatter = {
    id: taskId,
    title: input.title,
    project: projectSlug,
    plan: planId,
    status: "active",
    session: null,
    created_at: now,
    updated_at: now,
    started_at: null,
    completed_at: null,
    depends_on: input.dependsOn ?? [],
    tags: input.tags ?? [],
    block_reason: null,
    version: 1,
    review_verdict: "none",
    review_session: null,
  };

  const taskBody = upsertTaskLinks(
    [`# ${input.title}`, "", input.content || "_No content provided._"].join("\n"),
    fm,
  );
  await writeMarkdown(
    paths.taskFile(projectSlug, planId, taskId),
    fm as unknown as Record<string, unknown>,
    taskBody,
  );

  // Rebuild plan.md TOC to include the new task
  const taskRefs = await listTaskRefs(projectSlug, planId);
  const planParsed = await readMarkdown<PlanFrontmatter>(paths.planFile(projectSlug, planId));
  if (planParsed) {
    const updatedPlanFm: PlanFrontmatter = {
      ...planParsed.data,
      updated_at: now,
      version: planParsed.data.version + 1,
    };
    const body = renderPlanBody({ plan: updatedPlanFm, taskRefs });
    await writeMarkdown(
      paths.planFile(projectSlug, planId),
      updatedPlanFm as unknown as Record<string, unknown>,
      body,
    );
  }

  await logEvent(projectSlug, planId, {
    event: "task.added",
    entity: "task",
    entityId: taskId,
    payload: { title: input.title, index: taskIndex, depends_on: input.dependsOn ?? [] },
  });

  return { taskId, fm, taskIndex };
}

export async function deleteTask(
  projectSlug: string,
  planId: string,
  taskId: string,
): Promise<void> {
  const paths = getPaths();
  const filePath = paths.taskFile(projectSlug, planId, taskId);
  const parsed = await readMarkdown<TaskFrontmatter>(filePath);
  if (!parsed) throw new Error(`Task not found: ${taskId}`);

  await deleteFile(filePath);

  // Rebuild plan TOC — deleted file is already gone so listTaskRefs skips it
  const planParsed = await readMarkdown<PlanFrontmatter>(paths.planFile(projectSlug, planId));
  if (planParsed) {
    const taskRefs = await listTaskRefs(projectSlug, planId);
    const updatedPlanFm: PlanFrontmatter = {
      ...planParsed.data,
      updated_at: nowIso(),
      version: planParsed.data.version + 1,
    };
    const body = renderPlanBody({ plan: updatedPlanFm, taskRefs });
    await writeMarkdown(
      paths.planFile(projectSlug, planId),
      updatedPlanFm as unknown as Record<string, unknown>,
      body,
    );
  }

  await logEvent(projectSlug, planId, {
    event: "task.deleted",
    entity: "task",
    entityId: taskId,
    payload: { title: parsed.data.title },
  });
}

export interface EditTaskInput {
  title?: string;
  content?: string;
  dependsOn?: string[];
  tags?: string[];
  expectedVersion?: number;
}

export async function editTask(
  projectSlug: string,
  planId: string,
  taskId: string,
  input: EditTaskInput,
): Promise<TaskFrontmatter> {
  const paths = getPaths();
  const filePath = paths.taskFile(projectSlug, planId, taskId);
  const parsed = await readMarkdown<TaskFrontmatter>(filePath);
  if (!parsed) throw new Error(`Task not found: ${taskId}`);

  const current = parsed.data;

  if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
    throw new Error(
      `Stale write: expected version ${input.expectedVersion} but task is at version ${current.version}. Re-fetch and try again.`,
    );
  }

  const now = nowIso();
  const titleChanged = input.title !== undefined && input.title !== current.title;

  const next: TaskFrontmatter = {
    ...current,
    title: input.title ?? current.title,
    depends_on: input.dependsOn !== undefined ? input.dependsOn : current.depends_on,
    tags: input.tags !== undefined ? input.tags : current.tags,
    updated_at: now,
    version: current.version + 1,
  };

  let nextBody: string;
  if (input.content !== undefined) {
    // Full content replacement — prefix with title heading if caller didn't include one
    const heading = `# ${next.title}`;
    nextBody = input.content.trimStart().startsWith("#")
      ? input.content
      : `${heading}\n\n${input.content}`;
  } else if (titleChanged) {
    // Title only — update the H1 line in the existing body
    nextBody = parsed.content.replace(/^#[^\n]*/m, `# ${next.title}`);
  } else {
    nextBody = parsed.content;
  }

  await writeMarkdown(
    filePath,
    next as unknown as Record<string, unknown>,
    upsertTaskLinks(nextBody, next),
  );

  // Rebuild plan TOC only when the display title changed
  if (titleChanged) {
    const planParsed = await readMarkdown<PlanFrontmatter>(paths.planFile(projectSlug, planId));
    if (planParsed) {
      const taskRefs = await listTaskRefs(projectSlug, planId);
      const updatedPlanFm: PlanFrontmatter = {
        ...planParsed.data,
        updated_at: now,
        version: planParsed.data.version + 1,
      };
      const body = renderPlanBody({ plan: updatedPlanFm, taskRefs });
      await writeMarkdown(
        paths.planFile(projectSlug, planId),
        updatedPlanFm as unknown as Record<string, unknown>,
        body,
      );
    }
  }

  await logEvent(projectSlug, planId, {
    event: "task.edited",
    entity: "task",
    entityId: taskId,
    payload: {
      title_changed: titleChanged,
      content_replaced: input.content !== undefined,
      depends_on: next.depends_on,
    },
  });

  return next;
}

export async function listTaskRefs(
  projectSlug: string,
  planId: string,
): Promise<{ id: string; title: string }[]> {
  const tasksDir = getPaths().tasksDir(projectSlug, planId);
  const files = (await listFiles(tasksDir, ".md")).slice().sort();
  const refs: { id: string; title: string }[] = [];
  for (const fname of files) {
    const parsed = await readMarkdown<TaskFrontmatter>(
      getPaths().taskFile(projectSlug, planId, fname.replace(/\.md$/, "")),
    );
    if (!parsed) continue;
    refs.push({ id: parsed.data.id, title: parsed.data.title });
  }
  return refs;
}

export async function syncProjectGraphLinks(projectSlug: string): Promise<void> {
  await migrateProjectGraphFile(projectSlug);

  const entry = await lookupBySlug(projectSlug);
  if (!entry) return;

  const paths = getPaths();
  const filePath = paths.projectFile(projectSlug);
  const parsed = await readMarkdown<ProjectFrontmatter>(filePath);
  const fm: ProjectFrontmatter =
    parsed?.data ?? {
      slug: entry.slug,
      name: entry.slug,
      path: entry.path,
      created_at: entry.registeredAt,
    };
  const body =
    parsed?.content ??
    `# ${entry.slug}\n\n- Absolute path: \`${entry.path}\`\n- Registered: ${entry.registeredAt}\n\nPlans for this project live in the \`plans/\` folder next to this file.\n`;
  const plans = await listPlans(projectSlug);

  await writeMarkdown(
    filePath,
    fm as unknown as Record<string, unknown>,
    upsertManagedLinks(body, projectLinkLines({ projectSlug, plans })),
  );
}

export async function relinkProjectGraph(
  projectSlug: string,
  planId?: string,
): Promise<{ plans: number; tasks: number }> {
  await migrateProjectGraphFile(projectSlug);

  const paths = getPaths();
  const plans = planId
    ? [await getPlanById(projectSlug, planId)].filter((p): p is PlanFrontmatter => p !== null)
    : await listPlans(projectSlug);
  if (planId && plans.length === 0) throw new Error(`Plan not found: ${planId}`);

  let taskCount = 0;
  for (const planRef of plans) {
    await migratePlanGraphFile(projectSlug, planRef.id);
    await removeLegacySessionsDir(projectSlug, planRef.id);

    const parsedPlan = await readMarkdown<PlanFrontmatter>(
      paths.planFile(projectSlug, planRef.id),
    );
    const plan = parsedPlan?.data ?? planRef;
    const taskRefs = await listTaskRefs(projectSlug, plan.id);
    await writeMarkdown(
      paths.planFile(projectSlug, plan.id),
      plan as unknown as Record<string, unknown>,
      renderPlanBody({
        plan,
        taskRefs,
        revisionNote: parsedPlan ? extractRevisionNote(parsedPlan.content) : null,
      }),
    );

    const taskFiles = await listFiles(paths.tasksDir(projectSlug, plan.id), ".md");
    for (const file of taskFiles) {
      const taskId = file.replace(/\.md$/, "");
      const parsed = await readMarkdown<TaskFrontmatter>(
        paths.taskFile(projectSlug, plan.id, taskId),
      );
      if (!parsed) continue;
      await writeMarkdown(
        paths.taskFile(projectSlug, plan.id, taskId),
        parsed.data as unknown as Record<string, unknown>,
        upsertTaskLinks(parsed.content, parsed.data),
      );
      taskCount += 1;
    }

    await logEvent(projectSlug, plan.id, {
      event: "plan.relinked",
      entity: "plan",
      entityId: plan.id,
      payload: { taskCount: taskRefs.length },
    });
  }

  await syncProjectGraphLinks(projectSlug);
  return { plans: plans.length, tasks: taskCount };
}

function extractRevisionNote(body: string): string | null {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "## Revision note");
  if (start === -1) return null;
  const nextSection = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line));
  const end = nextSection === -1 ? lines.length : start + 1 + nextSection;
  const note = lines.slice(start + 1, end).join("\n").trim();
  return note.length > 0 ? note : null;
}

async function migrateProjectGraphFile(projectSlug: string): Promise<void> {
  const paths = getPaths();
  await migrateFile(paths.legacyProjectFile(projectSlug), paths.projectFile(projectSlug));
}

async function migratePlanGraphFile(projectSlug: string, planId: string): Promise<void> {
  const paths = getPaths();
  await migrateFile(paths.legacyPlanFile(projectSlug, planId), paths.planFile(projectSlug, planId));
}

async function migrateFile(legacyPath: string, currentPath: string): Promise<void> {
  const hasLegacy = await fileExists(legacyPath);
  if (!hasLegacy) return;

  if (!(await fileExists(currentPath))) {
    await moveFile(legacyPath, currentPath);
    return;
  }

  await deleteFile(legacyPath);
}

async function removeLegacySessionsDir(projectSlug: string, planId: string): Promise<void> {
  const dir = path.join(getPaths().planDir(projectSlug, planId), "sessions");
  await removeDir(dir);
}
