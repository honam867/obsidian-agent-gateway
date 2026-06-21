import { getFeature, ResolvedFeature } from "./feature.js";
import { readProgress, Progress } from "./working.js";
import { listKnowledge, KnowledgePointer } from "./knowledge.js";
import { listTopInstincts, InstinctFm } from "./instinct.js";
import { listLessons, LessonPointer } from "./lesson.js";
import { listPlaybooks, PlaybookPointer } from "./playbook.js";
import { slugify } from "../utils/slug.js";

export interface RecallBundle {
  feature: ResolvedFeature | null;
  progress: Progress | null;
  knowledge: KnowledgePointer[];
  lessons: LessonPointer[];
  playbooks: PlaybookPointer[];
  instincts: InstinctFm[];
}

export async function recall(
  feature: string,
  opts?: { instinctLimit?: number },
): Promise<RecallBundle> {
  const slug = slugify(feature) || "feature";
  const resolved = await getFeature(slug);
  const progress = resolved ? await readProgress(slug) : null;

  const knowledge: KnowledgePointer[] = [];
  const lessons: LessonPointer[] = [];
  const playbooks: PlaybookPointer[] = [];
  if (resolved) {
    for (const repo of resolved.repos) {
      for (const k of await listKnowledge(repo)) knowledge.push(k);
      for (const l of await listLessons(repo)) lessons.push(l);
      for (const p of await listPlaybooks(repo)) playbooks.push(p);
    }
  }

  const instincts = await listTopInstincts(opts?.instinctLimit ?? 5);

  return { feature: resolved, progress, knowledge, lessons, playbooks, instincts };
}
