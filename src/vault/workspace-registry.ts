import path from "node:path";
import { getPaths } from "./vault-io.js";
import { readFileIfExists, writeAtomic } from "./atomic-write.js";

export interface RepoEntry {
  slug: string;
  path: string;
  git_remote?: string;
  registered_at: string;
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
