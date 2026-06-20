import path from "node:path";
import { fileExists } from "../vault/atomic-write.js";
import {
  listRepoEntries,
  lookupRepoBySlug,
  getMostRecentFeature,
  RepoEntry,
} from "../vault/workspace-registry.js";
import { registerRepo } from "./feature.js";
import { recall, RecallBundle } from "./recall.js";

function isInside(child: string, parent: string): boolean {
  const c = path.resolve(child).toLowerCase();
  const p = path.resolve(parent).toLowerCase();
  if (c === p) return true;
  return c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

export async function resolveCwd(cwd: string): Promise<RepoEntry | null> {
  const normalized = path.resolve(cwd);
  const repos = await listRepoEntries();
  const matches = repos
    .filter((r) => isInside(normalized, r.path))
    .sort((a, b) => b.path.length - a.path.length);
  if (matches.length > 0) return matches[0];

  if (await fileExists(path.join(normalized, ".git"))) {
    const reg = await registerRepo(normalized);
    return lookupRepoBySlug(reg.slug);
  }
  return null;
}

export type RecallHow = "repo-active" | "global-recent" | "none";

export interface AgentRecallResult {
  resolved: { repo: string | null; feature: string | null; how: RecallHow };
  recall: RecallBundle;
}

export async function agentRecall(
  cwd: string,
  opts?: { instinctLimit?: number },
): Promise<AgentRecallResult> {
  const repo = await resolveCwd(cwd);

  let featureSlug: string | null = null;
  let how: RecallHow = "none";

  if (repo?.active_feature) {
    featureSlug = repo.active_feature;
    how = "repo-active";
  } else {
    const recent = await getMostRecentFeature();
    if (recent) {
      featureSlug = recent.slug;
      how = "global-recent";
    }
  }

  const bundle = await recall(featureSlug ?? "__none__", { instinctLimit: opts?.instinctLimit });
  return {
    resolved: { repo: repo?.slug ?? null, feature: featureSlug, how },
    recall: bundle,
  };
}
