import { slugify } from "../utils/slug.js";
import { getFeature } from "./feature.js";
import { touchFeatureUpdatedAt, setRepoActiveFeature } from "../vault/workspace-registry.js";

export async function recordFeatureActivity(featureSlug: string): Promise<void> {
  const slug = slugify(featureSlug) || "feature";
  await touchFeatureUpdatedAt(slug);
  const feature = await getFeature(slug);
  if (!feature) return;
  for (const repo of feature.repos) {
    await setRepoActiveFeature(repo, slug);
  }
}
