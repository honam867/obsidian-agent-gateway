import { getPaths, readMarkdown, writeMarkdown, listFiles } from "../vault/vault-io.js";
import { nowIso } from "../utils/time.js";
import { slugify } from "../utils/slug.js";

export interface LessonInput {
  repo: string;
  slug: string;
  symptom: string;
  cause: string;
  fix: string;
  sourcePaths?: string[];
  tags?: string[];
}

export interface LessonFm {
  id: string;
  repo: string;
  status: "fixed";
  symptom: string;
  cause: string;
  fix: string;
  confidence: number;
  observations: number;
  last_reinforced_at: string;
  created_at: string;
  source_paths: string[];
  tags: string[];
}

export interface LessonPointer {
  id: string;
  repo: string;
  confidence: number;
  observations: number;
  source_paths: string[];
}

function reinforce(confidence: number): number {
  return Math.min(1, confidence + (1 - confidence) * 0.5);
}

export async function saveLesson(input: LessonInput): Promise<LessonFm> {
  const id = slugify(input.slug) || "lesson";
  const now = nowIso();
  const existing = await readMarkdown<LessonFm>(getPaths().repoLessonFile(input.repo, id));

  const fm: LessonFm = existing
    ? {
        ...existing.data,
        status: "fixed",
        symptom: input.symptom,
        cause: input.cause,
        fix: input.fix,
        confidence: reinforce(existing.data.confidence),
        observations: existing.data.observations + 1,
        last_reinforced_at: now,
        source_paths: input.sourcePaths ?? existing.data.source_paths ?? [],
        tags: input.tags ?? existing.data.tags ?? [],
      }
    : {
        id,
        repo: input.repo,
        status: "fixed",
        symptom: input.symptom,
        cause: input.cause,
        fix: input.fix,
        confidence: 0.5,
        observations: 1,
        last_reinforced_at: now,
        created_at: now,
        source_paths: input.sourcePaths ?? [],
        tags: input.tags ?? [],
      };

  const body = [
    `# ${input.slug}`,
    "",
    "## Symptom",
    "",
    input.symptom,
    "",
    "## Cause",
    "",
    input.cause,
    "",
    "## Fix",
    "",
    input.fix,
    "",
  ].join("\n");

  await writeMarkdown(
    getPaths().repoLessonFile(input.repo, id),
    fm as unknown as Record<string, unknown>,
    body,
  );
  return fm;
}

export async function getLesson(
  repo: string,
  slug: string,
): Promise<{ data: LessonFm; content: string } | null> {
  const id = slugify(slug) || "lesson";
  const parsed = await readMarkdown<LessonFm>(getPaths().repoLessonFile(repo, id));
  return parsed ? { data: parsed.data, content: parsed.content } : null;
}

export async function listLessons(repo: string): Promise<LessonPointer[]> {
  const files = await listFiles(getPaths().repoLessonsDir(repo), ".md");
  const out: LessonPointer[] = [];
  for (const file of files) {
    const id = file.replace(/\.md$/, "");
    const parsed = await readMarkdown<LessonFm>(getPaths().repoLessonFile(repo, id));
    if (!parsed) continue;
    out.push({
      id: parsed.data.id,
      repo: parsed.data.repo,
      confidence: parsed.data.confidence,
      observations: parsed.data.observations,
      source_paths: parsed.data.source_paths ?? [],
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence || b.observations - a.observations);
}
