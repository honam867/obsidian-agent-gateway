import { z } from "zod";

export const PlanStatus = z.enum(["draft", "active", "archived"]);
export type PlanStatus = z.infer<typeof PlanStatus>;

export const PlanFrontmatter = z.object({
  id: z.string(),
  title: z.string(),
  project: z.string(),
  status: PlanStatus,
  created_at: z.string(),
  updated_at: z.string(),
  version: z.number().int().nonnegative(),
  breakdown_strategy: z.enum(["single", "h2", "h2_h3", "marker"]).optional(),
  tags: z.array(z.string()).default([]),
});

export type PlanFrontmatter = z.infer<typeof PlanFrontmatter>;
