import path from "node:path";
import { getPaths } from "./vault-io.js";
import { readFileIfExists, writeAtomic } from "./atomic-write.js";

export interface RepoEntry {
  slug: string;
  path: string;
  git_remote?: string;
  registered_at: string;
  active_feature?: string;
}

export interface FeatureEntry {
  slug: string;
  title: string;
  repos: string[];
  paths: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceIndex {
  repos: Record<string, RepoEntry>;
  features: Record<string, FeatureEntry>;
}

async function readIndex(): Promise<WorkspaceIndex> {
  const raw = await readFileIfExists(getPaths().workspaceIndexFile);
  if (!raw) return { repos: {}, features: {} };
  try {
    const idx = JSON.parse(raw) as Partial<WorkspaceIndex>;
    return { repos: idx.repos ?? {}, features: idx.features ?? {} };
  } catch {
    return { repos: {}, features: {} };
  }
}

async function writeIndex(idx: WorkspaceIndex): Promise<void> {
  await writeAtomic(getPaths().workspaceIndexFile, JSON.stringify(idx, null, 2));
}

export async function registerRepoEntry(
  slug: string,
  absPath: string,
  gitRemote?: string,
): Promise<RepoEntry> {
  const idx = await readIndex();
  const entry: RepoEntry = {
    slug,
    path: path.resolve(absPath),
    git_remote: gitRemote,
    registered_at: new Date().toISOString(),
  };
  await writeIndex({ ...idx, repos: { ...idx.repos, [slug]: entry } });
  return entry;
}

export async function lookupRepoBySlug(slug: string): Promise<RepoEntry | null> {
  const idx = await readIndex();
  return idx.repos[slug] ?? null;
}

export async function lookupRepoByPath(absPath: string): Promise<RepoEntry | null> {
  const normalized = path.resolve(absPath).toLowerCase();
  const idx = await readIndex();
  return (
    Object.values(idx.repos).find((r) => path.resolve(r.path).toLowerCase() === normalized) ?? null
  );
}

export async function listRepoEntries(): Promise<RepoEntry[]> {
  const idx = await readIndex();
  return Object.values(idx.repos).sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function upsertFeatureEntry(entry: FeatureEntry): Promise<FeatureEntry> {
  const idx = await readIndex();
  await writeIndex({ ...idx, features: { ...idx.features, [entry.slug]: entry } });
  return entry;
}

export async function lookupFeatureBySlug(slug: string): Promise<FeatureEntry | null> {
  const idx = await readIndex();
  return idx.features[slug] ?? null;
}

export async function listFeatureEntries(): Promise<FeatureEntry[]> {
  const idx = await readIndex();
  return Object.values(idx.features).sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function setRepoActiveFeature(
  repoSlug: string,
  featureSlug: string,
): Promise<void> {
  const idx = await readIndex();
  const repo = idx.repos[repoSlug];
  if (!repo) return;
  await writeIndex({
    ...idx,
    repos: { ...idx.repos, [repoSlug]: { ...repo, active_feature: featureSlug } },
  });
}

export async function touchFeatureUpdatedAt(featureSlug: string): Promise<void> {
  const idx = await readIndex();
  const feature = idx.features[featureSlug];
  if (!feature) return;
  await writeIndex({
    ...idx,
    features: {
      ...idx.features,
      [featureSlug]: { ...feature, updated_at: new Date().toISOString() },
    },
  });
}

export async function getMostRecentFeature(): Promise<FeatureEntry | null> {
  const idx = await readIndex();
  const features = Object.values(idx.features);
  if (features.length === 0) return null;
  return features.slice().sort((a, b) => {
    const at = Date.parse(a.updated_at) || 0;
    const bt = Date.parse(b.updated_at) || 0;
    if (bt !== at) return bt - at;
    return a.slug.localeCompare(b.slug);
  })[0];
}
