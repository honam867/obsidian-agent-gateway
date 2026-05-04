import path from "node:path";

export interface VaultPaths {
  root: string;
  projectsDir: string;
  indexDir: string;
  indexFile: string;
  projectDir(slug: string): string;
  projectFile(slug: string): string;
  plansDir(slug: string): string;
  planDir(slug: string, planId: string): string;
  planFile(slug: string, planId: string): string;
  tasksDir(slug: string, planId: string): string;
  taskFile(slug: string, planId: string, taskId: string): string;
  sessionsDir(slug: string, planId: string): string;
  auditFile(slug: string, planId: string, yearMonth: string): string;
}

export function makeVaultPaths(vaultRoot: string): VaultPaths {
  const root = path.resolve(vaultRoot);
  const projectsDir = path.join(root, "projects");
  const indexDir = path.join(root, "_index");
  const indexFile = path.join(indexDir, "projects.json");

  return {
    root,
    projectsDir,
    indexDir,
    indexFile,
    projectDir: (slug) => path.join(projectsDir, slug),
    projectFile: (slug) => path.join(projectsDir, slug, "project.md"),
    plansDir: (slug) => path.join(projectsDir, slug, "plans"),
    planDir: (slug, planId) => path.join(projectsDir, slug, "plans", planId),
    planFile: (slug, planId) => path.join(projectsDir, slug, "plans", planId, "plan.md"),
    tasksDir: (slug, planId) => path.join(projectsDir, slug, "plans", planId, "tasks"),
    taskFile: (slug, planId, taskId) =>
      path.join(projectsDir, slug, "plans", planId, "tasks", `${taskId}.md`),
    sessionsDir: (slug, planId) => path.join(projectsDir, slug, "plans", planId, "sessions"),
    auditFile: (slug, planId, yearMonth) =>
      path.join(projectsDir, slug, "plans", planId, "sessions", `audit-${yearMonth}.jsonl`),
  };
}
