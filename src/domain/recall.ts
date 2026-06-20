import { getFeature, ResolvedFeature } from "./feature.js";
import { readProgress, Progress } from "./working.js";
import { listKnowledge, KnowledgePointer } from "./knowledge.js";
import { listTopInstincts, InstinctFm } from "./instinct.js";
import { slugify } from "../utils/slug.js";

export interface RecallBundle {
  feature: ResolvedFeature | null;
  progress: Progress | null;
  knowledge: KnowledgePointer[];
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
  if (resolved) {
    for (const repo of resolved.repos) {
      const pointers = await listKnowledge(repo);
      for (const p of pointers) knowledge.push(p);
    }
  }

  const instincts = await listTopInstincts(opts?.instinctLimit ?? 5);

  return { feature: resolved, progress, knowledge, instincts };
}
