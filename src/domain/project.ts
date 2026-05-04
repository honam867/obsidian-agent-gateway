import path from "node:path";
import { getPaths, readMarkdown, writeMarkdown } from "../vault/vault-io.js";
import {
  lookupBySlug,
  lookupByPath,
  registerProject,
  ProjectIndexEntry,
} from "../vault/project-registry.js";
import { projectSlugFromPath } from "../utils/slug.js";
import { nowIso } from "../utils/time.js";
import { ProjectFrontmatter } from "../schemas/project.js";

export interface ResolvedProject {
  slug: string;
  name: string;
  path: string;
  created: boolean;
}

/**
 * Resolve a project from an absolute workspace path.
 * If the project isn't registered yet, register it using the directory name as slug.
 * If a project with that slug exists but maps to a different path, throw (no auto-hash).
 */
export async function resolveOrRegisterProject(absPath: string): Promise<ResolvedProject> {
  const normalized = path.resolve(absPath);
  const existingByPath = await lookupByPath(normalized);
  if (existingByPath) {
    return { slug: existingByPath.slug, name: existingByPath.slug, path: existingByPath.path, created: false };
  }

  const slug = projectSlugFromPath(normalized);
  const existingBySlug = await lookupBySlug(slug);
  if (existingBySlug && path.resolve(existingBySlug.path).toLowerCase() !== normalized.toLowerCase()) {
    throw new Error(
      `Project slug conflict: "${slug}" is already registered for "${existingBySlug.path}". ` +
        `Refusing to register "${normalized}" under the same slug. ` +
        `Rename your directory or manually edit the vault's _index/projects.json.`,
    );
  }

  const entry = await registerProject(slug, normalized);
  await writeProjectDoc(entry);
  return { slug: entry.slug, name: entry.slug, path: entry.path, created: true };
}

async function writeProjectDoc(entry: ProjectIndexEntry) {
  const fm: ProjectFrontmatter = {
    slug: entry.slug,
    name: entry.slug,
    path: entry.path,
    created_at: entry.registeredAt,
  };
  const body = `# ${entry.slug}\n\n- Absolute path: \`${entry.path}\`\n- Registered: ${entry.registeredAt}\n\nPlans for this project live in the \`plans/\` folder next to this file.\n`;
  await writeMarkdown(getPaths().projectFile(entry.slug), fm as unknown as Record<string, unknown>, body);
}

export async function getProject(slug: string): Promise<ResolvedProject | null> {
  const entry = await lookupBySlug(slug);
  if (!entry) return null;
  return { slug: entry.slug, name: entry.slug, path: entry.path, created: false };
}

export async function readProjectFile(slug: string) {
  return readMarkdown<ProjectFrontmatter>(getPaths().projectFile(slug));
}

export async function touchProjectUpdated(_slug: string): Promise<void> {
  // Placeholder in case we later add last-activity timestamps to project.md.
  return;
}
