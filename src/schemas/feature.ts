import { z } from "zod";

export const FeatureStatus = z.enum(["active", "paused", "done"]);
export type FeatureStatus = z.infer<typeof FeatureStatus>;

export const FeatureFrontmatter = z.object({
  slug: z.string(),
  title: z.string(),
  repos: z.array(z.string()),
  paths: z.array(z.string()),
  status: FeatureStatus,
  created_at: z.string(),
  updated_at: z.string(),
});

export type FeatureFrontmatter = z.infer<typeof FeatureFrontmatter>;
