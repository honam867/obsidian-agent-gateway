import path from "node:path";

export interface VaultPaths {
  root: string;
  projectsDir: string;
  indexDir: string;
  indexFile: string;
  projectDir(slug: string): string;
  projectFile(slug: string): string;
  legacyProjectFile(slug: string): string;
  plansDir(slug: string): string;
  planDir(slug: string, planId: string): string;
  planFile(slug: string, planId: string): string;
  legacyPlanFile(slug: string, planId: string): string;
  tasksDir(slug: string, planId: string): string;
  taskFile(slug: string, planId: string, taskId: string): string;
  workspaceIndexFile: string;
  featuresDir: string;
  featureDir(slug: string): string;
  featureFile(slug: string): string;
  reposDir: string;
  repoDir(slug: string): string;
  repoFile(slug: string): string;
  globalDir: string;
  playbooksDir: string;
  instinctsDir: string;
  featureWorkingDir(slug: string): string;
  featureCurrentFile(slug: string): string;
  repoKnowledgeDir(repo: string): string;
  repoKnowledgeFile(repo: string, area: string): string;
  instinctFile(slug: string): string;
}

export function makeVaultPaths(vaultRoot: string): VaultPaths {
  const root = path.resolve(vaultRoot);
  const projectsDir = path.join(root, "projects");
  const indexDir = path.join(root, "_index");
  const indexFile = path.join(indexDir, "projects.json");
  const featuresDir = path.join(root, "features");
  const reposDir = path.join(root, "repos");
  const globalDir = path.join(root, "global");

  return {
    root,
    projectsDir,
    indexDir,
    indexFile,
    projectDir: (slug) => path.join(projectsDir, slug),
    projectFile: (slug) => path.join(projectsDir, slug, `${slug}.md`),
    legacyProjectFile: (slug) => path.join(projectsDir, slug, "project.md"),
    plansDir: (slug) => path.join(projectsDir, slug, "plans"),
    planDir: (slug, planId) => path.join(projectsDir, slug, "plans", planId),
    planFile: (slug, planId) => path.join(projectsDir, slug, "plans", planId, `${planId}.md`),
    legacyPlanFile: (slug, planId) => path.join(projectsDir, slug, "plans", planId, "plan.md"),
    tasksDir: (slug, planId) => path.join(projectsDir, slug, "plans", planId, "tasks"),
    taskFile: (slug, planId, taskId) =>
      path.join(projectsDir, slug, "plans", planId, "tasks", `${taskId}.md`),
    workspaceIndexFile: path.join(indexDir, "workspace.json"),
    featuresDir,
    featureDir: (slug) => path.join(featuresDir, slug),
    featureFile: (slug) => path.join(featuresDir, slug, "_feature.md"),
    reposDir,
    repoDir: (slug) => path.join(reposDir, slug),
    repoFile: (slug) => path.join(reposDir, slug, "_repo.md"),
    globalDir,
    playbooksDir: path.join(globalDir, "playbooks"),
    instinctsDir: path.join(globalDir, "instincts"),
    featureWorkingDir: (slug) => path.join(featuresDir, slug, "working"),
    featureCurrentFile: (slug) => path.join(featuresDir, slug, "working", "current.md"),
    repoKnowledgeDir: (repo) => path.join(reposDir, repo, "knowledge"),
    repoKnowledgeFile: (repo, area) => path.join(reposDir, repo, "knowledge", `${area}.md`),
    instinctFile: (slug) => path.join(globalDir, "instincts", `${slug}.md`),
  };
}
