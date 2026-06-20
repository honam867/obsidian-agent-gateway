import { getPaths, readMarkdown, writeMarkdown, listFiles } from "../vault/vault-io.js";
import { nowIso } from "../utils/time.js";
import { slugify } from "../utils/slug.js";

export interface KnowledgeInput {
  repo: string;
  area: string;
  body: string;
  sourcePaths?: string[];
  tags?: string[];
}

export interface KnowledgeFm {
  id: string;
  repo: string;
  area: string;
  source_paths: string[];
  verified_at: string;
  stale: boolean;
  tags: string[];
}

export interface KnowledgePointer {
  id: string;
  repo: string;
  area: string;
  source_paths: string[];
  stale: boolean;
}

export async function saveKnowledge(input: KnowledgeInput): Promise<KnowledgeFm> {
  const id = slugify(input.area) || "knowledge";
  const fm: KnowledgeFm = {
    id,
    repo: input.repo,
    area: input.area,
    source_paths: input.sourcePaths ?? [],
    verified_at: nowIso(),
    stale: false,
    tags: input.tags ?? [],
  };
  const body = [`# ${input.area}`, "", input.body, ""].join("\n");
  await writeMarkdown(
    getPaths().repoKnowledgeFile(input.repo, id),
    fm as unknown as Record<string, unknown>,
    body,
  );
  return fm;
}

export async function getKnowledge(
  repo: string,
  area: string,
): Promise<{ data: KnowledgeFm; content: string } | null> {
  const id = slugify(area) || "knowledge";
  const parsed = await readMarkdown<KnowledgeFm>(getPaths().repoKnowledgeFile(repo, id));
  return parsed ? { data: parsed.data, content: parsed.content } : null;
}

export async function listKnowledge(repo: string): Promise<KnowledgePointer[]> {
  const files = await listFiles(getPaths().repoKnowledgeDir(repo), ".md");
  const out: KnowledgePointer[] = [];
  for (const file of files) {
    const id = file.replace(/\.md$/, "");
    const parsed = await readMarkdown<KnowledgeFm>(getPaths().repoKnowledgeFile(repo, id));
    if (!parsed) continue;
    out.push({
      id: parsed.data.id,
      repo: parsed.data.repo,
      area: parsed.data.area,
      source_paths: parsed.data.source_paths ?? [],
      stale: parsed.data.stale ?? false,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
