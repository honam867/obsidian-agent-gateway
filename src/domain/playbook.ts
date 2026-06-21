import { getPaths, readMarkdown, writeMarkdown, listFiles } from "../vault/vault-io.js";
import { nowIso } from "../utils/time.js";
import { slugify } from "../utils/slug.js";

export interface PlaybookInput {
  repo: string;
  slug: string;
  title: string;
  steps: string;
  tags?: string[];
}

export interface PlaybookFm {
  id: string;
  repo: string;
  title: string;
  confidence: number;
  observations: number;
  last_reinforced_at: string;
  created_at: string;
  tags: string[];
}

export interface PlaybookPointer {
  id: string;
  repo: string;
  title: string;
  confidence: number;
}

function reinforce(confidence: number): number {
  return Math.min(1, confidence + (1 - confidence) * 0.5);
}

export async function savePlaybook(input: PlaybookInput): Promise<PlaybookFm> {
  const id = slugify(input.slug) || "playbook";
  const now = nowIso();
  const existing = await readMarkdown<PlaybookFm>(getPaths().repoPlaybookFile(input.repo, id));

  const fm: PlaybookFm = existing
    ? {
        ...existing.data,
        title: input.title,
        confidence: reinforce(existing.data.confidence),
        observations: existing.data.observations + 1,
        last_reinforced_at: now,
        tags: input.tags ?? existing.data.tags ?? [],
      }
    : {
        id,
        repo: input.repo,
        title: input.title,
        confidence: 0.5,
        observations: 1,
        last_reinforced_at: now,
        created_at: now,
        tags: input.tags ?? [],
      };

  const body = [`# ${input.title}`, "", "## Steps", "", input.steps, ""].join("\n");
  await writeMarkdown(
    getPaths().repoPlaybookFile(input.repo, id),
    fm as unknown as Record<string, unknown>,
    body,
  );
  return fm;
}

export async function getPlaybook(
  repo: string,
  slug: string,
): Promise<{ data: PlaybookFm; content: string } | null> {
  const id = slugify(slug) || "playbook";
  const parsed = await readMarkdown<PlaybookFm>(getPaths().repoPlaybookFile(repo, id));
  return parsed ? { data: parsed.data, content: parsed.content } : null;
}

export async function listPlaybooks(repo: string): Promise<PlaybookPointer[]> {
  const files = await listFiles(getPaths().repoPlaybooksDir(repo), ".md");
  const out: PlaybookPointer[] = [];
  for (const file of files) {
    const id = file.replace(/\.md$/, "");
    const parsed = await readMarkdown<PlaybookFm>(getPaths().repoPlaybookFile(repo, id));
    if (!parsed) continue;
    out.push({
      id: parsed.data.id,
      repo: parsed.data.repo,
      title: parsed.data.title,
      confidence: parsed.data.confidence,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}
