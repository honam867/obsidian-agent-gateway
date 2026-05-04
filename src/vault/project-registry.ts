import path from "node:path";
import { getPaths } from "./vault-io.js";
import { readFileIfExists, writeAtomic } from "./atomic-write.js";

export interface ProjectIndexEntry {
  slug: string;
  path: string;
  registeredAt: string;
}

interface Index {
  projects: Record<string, ProjectIndexEntry>;
}

async function readIndex(): Promise<Index> {
  const raw = await readFileIfExists(getPaths().indexFile);
  if (!raw) return { projects: {} };
  try {
    return JSON.parse(raw) as Index;
  } catch {
    return { projects: {} };
  }
}

async function writeIndex(idx: Index): Promise<void> {
  await writeAtomic(getPaths().indexFile, JSON.stringify(idx, null, 2));
}

export async function lookupProject(slug: string): Promise<ProjectIndexEntry | null> {
  const idx = await readIndex();
  return idx.projects[slug] ?? null;
}

export async function lookupBySlug(slug: string): Promise<ProjectIndexEntry | null> {
  return lookupProject(slug);
}

export async function lookupByPath(absPath: string): Promise<ProjectIndexEntry | null> {
  const normalized = path.resolve(absPath).toLowerCase();
  const idx = await readIndex();
  return (
    Object.values(idx.projects).find(
      (p) => path.resolve(p.path).toLowerCase() === normalized,
    ) ?? null
  );
}

export async function registerProject(slug: string, absPath: string): Promise<ProjectIndexEntry> {
  const idx = await readIndex();
  const entry: ProjectIndexEntry = {
    slug,
    path: path.resolve(absPath),
    registeredAt: new Date().toISOString(),
  };
  idx.projects[slug] = entry;
  await writeIndex(idx);
  return entry;
}

export async function listProjects(): Promise<ProjectIndexEntry[]> {
  const idx = await readIndex();
  return Object.values(idx.projects).sort((a, b) => a.slug.localeCompare(b.slug));
}
