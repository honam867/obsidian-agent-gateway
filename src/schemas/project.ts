import { z } from "zod";

export const ProjectFrontmatter = z.object({
  slug: z.string(),
  name: z.string(),
  path: z.string(),
  created_at: z.string(),
  git_remote: z.string().optional(),
});

export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatter>;
