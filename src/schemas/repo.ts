import { z } from "zod";

export const RepoFrontmatter = z.object({
  slug: z.string(),
  path: z.string(),
  git_remote: z.string().optional(),
  run_cmd: z.string().optional(),
  test_cmd: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type RepoFrontmatter = z.infer<typeof RepoFrontmatter>;
