import { getPaths, listFiles, readMarkdown, writeMarkdown } from "../vault/vault-io.js";
import { ReviewVerdict, TaskFrontmatter, TaskStatus } from "../schemas/task.js";
import { assertTransition } from "./state-machine.js";
import { nowIso } from "../utils/time.js";
import { logEvent } from "./audit.js";

export interface TaskRecord {
  fm: TaskFrontmatter;
  body: string;
}

export async function getTask(
  projectSlug: string,
  planId: string,
  taskId: string,
): Promise<TaskRecord | null> {
  const parsed = await readMarkdown<TaskFrontmatter>(
    getPaths().taskFile(projectSlug, planId, taskId),
  );
  if (!parsed) return null;
  return { fm: parsed.data, body: parsed.content };
}

export async function listTasks(
  projectSlug: string,
  planId: string,
  filter?: { status?: TaskStatus | TaskStatus[] },
): Promise<TaskFrontmatter[]> {
  const files = await listFiles(getPaths().tasksDir(projectSlug, planId), ".md");
  const statuses = filter?.status
    ? Array.isArray(filter.status)
      ? filter.status
      : [filter.status]
    : null;
  const out: TaskFrontmatter[] = [];
  for (const f of files) {
    const taskId = f.replace(/\.md$/, "");
    const rec = await getTask(projectSlug, planId, taskId);
    if (!rec) continue;
    if (statuses && !statuses.includes(rec.fm.status)) continue;
    out.push(rec.fm);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  session?: string | null;
  note?: string;
  blockReason?: string | null;
  expectedVersion?: number;
}

function appendNote(body: string, note: string): string {
  const stamp = nowIso();
  const header = "\n\n## Notes\n";
  const line = `- ${stamp} — ${note}`;
  return body.includes("## Notes")
    ? `${body.trimEnd()}\n${line}\n`
    : `${body.trimEnd()}${header}${line}\n`;
}

export async function updateTask(
  projectSlug: string,
  planId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskFrontmatter> {
  const paths = getPaths();
  const parsed = await readMarkdown<TaskFrontmatter>(paths.taskFile(projectSlug, planId, taskId));
  if (!parsed) throw new Error(`Task not found: ${taskId}`);
  const current = parsed.data;

  if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
    throw new Error(
      `Stale write: expected version ${input.expectedVersion} but task is at version ${current.version}. Re-fetch the task and try again.`,
    );
  }

  let status = current.status;
  if (input.status && input.status !== current.status) {
    assertTransition(current.status, input.status);
    status = input.status;
  }

  const now = nowIso();
  const startedAt =
    status === "in_progress" && !current.started_at ? now : current.started_at;
  let completedAt: string | null = current.completed_at;
  if (status === "done") completedAt = now;
  else if (current.status === "done") completedAt = null;

  const next: TaskFrontmatter = {
    ...current,
    status,
    session: input.session !== undefined ? input.session : current.session,
    block_reason: status === "blocked" ? input.blockReason ?? current.block_reason : null,
    started_at: startedAt,
    completed_at: completedAt,
    updated_at: now,
    version: current.version + 1,
  };

  const nextBody = input.note ? appendNote(parsed.content, input.note) : parsed.content;
  await writeMarkdown(
    paths.taskFile(projectSlug, planId, taskId),
    next as unknown as Record<string, unknown>,
    nextBody,
  );

  await logEvent(projectSlug, planId, {
    event: `task.update`,
    entity: "task",
    entityId: taskId,
    session: next.session ?? undefined,
    payload: {
      status_from: current.status,
      status_to: next.status,
      note: input.note ?? null,
      block_reason: next.block_reason,
    },
  });

  return next;
}

export async function completeTask(
  projectSlug: string,
  planId: string,
  taskId: string,
  summary?: string,
  session?: string | null,
): Promise<TaskFrontmatter> {
  return updateTask(projectSlug, planId, taskId, {
    status: "done",
    note: summary ? `Completed: ${summary}` : "Completed.",
    session: session ?? undefined,
  });
}

export interface SubmitReviewInput {
  verdict: ReviewVerdict;
  feedback: string;
  session?: string | null;
  expectedVersion?: number;
}

function replaceReviewSection(body: string, reviewBlock: string): string {
  const lines = body.split("\n");
  const reviewStart = lines.findIndex((l) => l.startsWith("## Review"));
  if (reviewStart === -1) {
    return `${body.trimEnd()}\n\n${reviewBlock}\n`;
  }
  const relativeNext = lines.slice(reviewStart + 1).findIndex((l) => l.startsWith("## "));
  const endIndex = relativeNext === -1 ? lines.length : reviewStart + 1 + relativeNext;
  const before = lines.slice(0, reviewStart).join("\n").trimEnd();
  const after = lines.slice(endIndex).join("\n").trim();
  return [before, reviewBlock, ...(after ? [after] : [])].join("\n\n").trimEnd() + "\n";
}

export async function submitReview(
  projectSlug: string,
  planId: string,
  taskId: string,
  input: SubmitReviewInput,
): Promise<TaskFrontmatter> {
  const paths = getPaths();
  const parsed = await readMarkdown<TaskFrontmatter>(paths.taskFile(projectSlug, planId, taskId));
  if (!parsed) throw new Error(`Task not found: ${taskId}`);
  const current = parsed.data;

  if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
    throw new Error(
      `Stale write: expected version ${input.expectedVersion} but task is at version ${current.version}. Re-fetch and try again.`,
    );
  }

  const now = nowIso();
  const verdictLabel =
    input.verdict === "approved" ? "Approved" : "Changes Requested";
  const reviewBlock =
    `## Review — ${now}\n` +
    `**Verdict:** ${verdictLabel}\n` +
    `**Reviewer:** ${input.session ?? "unknown"}\n\n` +
    input.feedback.trim();

  const nextBody = replaceReviewSection(parsed.content, reviewBlock);

  const next: TaskFrontmatter = {
    ...current,
    review_verdict: input.verdict,
    review_session: input.session ?? null,
    updated_at: now,
    version: current.version + 1,
  };

  await writeMarkdown(
    paths.taskFile(projectSlug, planId, taskId),
    next as unknown as Record<string, unknown>,
    nextBody,
  );

  await logEvent(projectSlug, planId, {
    event: "task.review",
    entity: "task",
    entityId: taskId,
    session: input.session ?? undefined,
    payload: { verdict: input.verdict },
  });

  return next;
}
