import { getPaths, readMarkdown, writeMarkdown, listFiles } from "../vault/vault-io.js";
import { nowIso } from "../utils/time.js";
import { slugify } from "../utils/slug.js";

export interface InstinctInput {
  slug: string;
  title: string;
  trigger: string;
  action: string;
  why: string;
  tags?: string[];
}

export interface InstinctFm {
  id: string;
  title: string;
  confidence: number;
  observations: number;
  status: "active" | "retired";
  last_reinforced_at: string;
  created_at: string;
  tags: string[];
}

function reinforce(confidence: number): number {
  return Math.min(1, confidence + (1 - confidence) * 0.5);
}

export async function saveInstinct(input: InstinctInput): Promise<InstinctFm> {
  const id = slugify(input.slug) || "instinct";
  const now = nowIso();
  const existing = await readMarkdown<InstinctFm>(getPaths().instinctFile(id));

  const fm: InstinctFm = existing
    ? {
        ...existing.data,
        title: input.title,
        confidence: reinforce(existing.data.confidence),
        observations: existing.data.observations + 1,
        status: existing.data.status ?? "active",
        last_reinforced_at: now,
        tags: input.tags ?? existing.data.tags ?? [],
      }
    : {
        id,
        title: input.title,
        confidence: 0.5,
        observations: 1,
        status: "active",
        last_reinforced_at: now,
        created_at: now,
        tags: input.tags ?? [],
      };

  const body = [
    `# ${input.title}`,
    "",
    "## Trigger",
    "",
    input.trigger,
    "",
    "## Action",
    "",
    input.action,
    "",
    "## Why",
    "",
    input.why,
    "",
  ].join("\n");

  await writeMarkdown(getPaths().instinctFile(id), fm as unknown as Record<string, unknown>, body);
  return fm;
}

export async function listTopInstincts(limit: number): Promise<InstinctFm[]> {
  const files = await listFiles(getPaths().instinctsDir, ".md");
  const out: InstinctFm[] = [];
  for (const file of files) {
    const id = file.replace(/\.md$/, "");
    const parsed = await readMarkdown<InstinctFm>(getPaths().instinctFile(id));
    if (!parsed) continue;
    if (parsed.data.status === "retired") continue;
    out.push(parsed.data);
  }
  out.sort((a, b) => b.confidence - a.confidence || b.observations - a.observations);
  return out.slice(0, limit);
}
