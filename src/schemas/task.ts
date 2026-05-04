import { z } from "zod";

export const TaskStatus = z.enum([
  "draft",
  "active",
  "in_progress",
  "blocked",
  "done",
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const ReviewVerdict = z.enum(["none", "approved", "changes_requested"]);
export type ReviewVerdict = z.infer<typeof ReviewVerdict>;

export const TaskFrontmatter = z.object({
  id: z.string(),
  title: z.string(),
  project: z.string(),
  plan: z.string(),
  status: TaskStatus,
  session: z.string().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
  started_at: z.string().nullable().default(null),
  completed_at: z.string().nullable().default(null),
  depends_on: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  block_reason: z.string().nullable().default(null),
  version: z.number().int().nonnegative(),
  review_verdict: ReviewVerdict.default("none"),
  review_session: z.string().nullable().default(null),
});

export type TaskFrontmatter = z.infer<typeof TaskFrontmatter>;
