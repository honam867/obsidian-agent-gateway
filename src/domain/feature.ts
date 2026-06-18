import path from "node:path";
import { promises as fs } from "node:fs";
import { getPaths, readMarkdown, writeMarkdown } from "../vault/vault-io.js";
import { fileExists } from "../vault/atomic-write.js";
import { slugify } from "../utils/slug.js";
import { nowIso } from "../utils/time.js";
import { RepoFrontmatter } from "../schemas/repo.js";
import { FeatureFrontmatter } from "../schemas/feature.js";
import {
  registerRepoEntry,
  lookupRepoByPath,
  upsertFeatureEntry,
  lookupFeatureBySlug,
  FeatureEntry,
  RepoEntry,
} from "../vault/workspace-registry.js";

export interface DiscoveredRepo {
  slug: string;
  path: string;
}

export async function discoverRepos(workspaceRoot: string): Promise<DiscoveredRepo[]> {
  const root = path.resolve(workspaceRoot);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const repos: DiscoveredRepo[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const repoPath = path.join(root, e.name);
    if (await fileExists(path.join(repoPath, ".git"))) {
      repos.push({ slug: slugify(e.name), path: repoPath });
    }
  }
  return repos.sort((a, b) => a.slug.localeCompare(b.slug));
}

export interface ResolvedRepo {
  slug: string;
  path: string;
  created: boolean;
}

export async function registerRepo(absPath: string, gitRemote?: string): Promise<ResolvedRepo> {
  const normalized = path.resolve(absPath);
  const existing = await lookupRepoByPath(normalized);
  if (existing) return { slug: existing.slug, path: existing.path, created: false };

  const slug = slugify(path.basename(normalized)) || "repo";
  const entry = await registerRepoEntry(slug, normalized, gitRemote);
  await writeRepoDoc(entry);
  return { slug: entry.slug, path: entry.path, created: true };
}

async function writeRepoDoc(entry: RepoEntry): Promise<void> {
  const now = nowIso();
  const fm: RepoFrontmatter = {
    slug: entry.slug,
    path: entry.path,
    git_remote: entry.git_remote,
    created_at: entry.registered_at,
    updated_at: now,
  };
  // Remove undefined values to prevent YAML stringify errors
  const fmClean = Object.fromEntries(
    Object.entries(fm).filter(([, v]) => v !== undefined)
  );
  const body = [
    `# ${entry.slug}`,
    "",
    `- Path: \`${entry.path}\``,
    "",
    "## Run / Test",
    "",
    "_Fill in run_cmd / test_cmd in the frontmatter._",
    "",
    "## Architecture",
    "",
    "_Summary of this repo (entry chain, conventions, gotchas)._",
    "",
  ].join("\n");
  await writeMarkdown(getPaths().repoFile(entry.slug), fmClean as unknown as Record<string, unknown>, body);
}

export interface ResolveFeatureInput {
  slug?: string;
  title?: string;
  repos?: string[];
  paths?: string[];
}

export interface ResolvedFeature {
  slug: string;
  title: string;
  repos: string[];
  paths: string[];
  status: string;
  created: boolean;
}

function mergeUnique(base: string[], extra?: string[]): string[] {
  if (!extra || extra.length === 0) return base;
  const set = new Set(base);
  for (const item of extra) set.add(item);
  return Array.from(set);
}

function toResolved(entry: FeatureEntry, created: boolean): ResolvedFeature {
  return {
    slug: entry.slug,
    title: entry.title,
    repos: entry.repos,
    paths: entry.paths,
    status: entry.status,
    created,
  };
}

export async function resolveFeature(input: ResolveFeatureInput): Promise<ResolvedFeature> {
  const title = input.title ?? input.slug ?? "untitled";
  const slug = slugify(input.slug ?? title) || "feature";
  const now = nowIso();

  const existing = await lookupFeatureBySlug(slug);
  if (existing) {
    const merged: FeatureEntry = {
      ...existing,
      repos: mergeUnique(existing.repos, input.repos),
      paths: mergeUnique(existing.paths, input.paths),
      updated_at: now,
    };
    await upsertFeatureEntry(merged);
    await writeFeatureDoc(merged);
    return toResolved(merged, false);
  }

  const entry: FeatureEntry = {
    slug,
    title,
    repos: input.repos ?? [],
    paths: input.paths ?? [],
    status: "active",
    created_at: now,
    updated_at: now,
  };
  await upsertFeatureEntry(entry);
  await writeFeatureDoc(entry);
  return toResolved(entry, true);
}

export async function getFeature(slug: string): Promise<ResolvedFeature | null> {
  const entry = await lookupFeatureBySlug(slug);
  return entry ? toResolved(entry, false) : null;
}

async function writeFeatureDoc(entry: FeatureEntry): Promise<void> {
  const fm: FeatureFrontmatter = {
    slug: entry.slug,
    title: entry.title,
    repos: entry.repos,
    paths: entry.paths,
    status: entry.status as FeatureFrontmatter["status"],
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  };
  const reposList = entry.repos.length ? entry.repos.map((r) => `- \`${r}\``).join("\n") : "_None yet._";
  const body = [
    `# ${entry.title}`,
    "",
    "## Repos",
    "",
    reposList,
    "",
    "Working memory lives in `working/`, lessons in `lessons/`, plans in `plans/`.",
    "",
  ].join("\n");
  await writeMarkdown(getPaths().featureFile(entry.slug), fm as unknown as Record<string, unknown>, body);
}
