import path from "node:path";
import {
  getPaths,
  readMarkdown,
  writeMarkdown,
  listFiles,
  listDirs,
} from "../vault/vault-io.js";
import { slugify } from "../utils/slug.js";
import { nowIso } from "../utils/time.js";

export type ReviewKind = "spec" | "plan";
export type ReviewState = "reviewing" | "approved";

export interface ReviewFm {
  kind: ReviewKind;
  slug: string;
  feature: string;
  path: string;
  state: ReviewState;
  updated_at: string;
}

export interface ReviewPointer {
  feature: string;
  kind: ReviewKind;
  slug: string;
  path: string;
  state: ReviewState;
}

const NO_FEEDBACK = "_No feedback yet._";

export function slugForPath(docPath: string): string {
  const base = path.basename(docPath, path.extname(docPath));
  return slugify(base) || "review";
}

function buildBody(slug: string, feedback: string): string {
  return [`# Review: ${slug}`, "", "## Feedback", "", feedback, ""].join("\n");
}

async function writeRecord(fm: ReviewFm, feedback: string): Promise<ReviewFm> {
  await writeMarkdown(
    getPaths().featureReviewFile(fm.feature, fm.kind, fm.slug),
    fm as unknown as Record<string, unknown>,
    buildBody(fm.slug, feedback),
  );
  return fm;
}

export async function openReview(input: {
  feature: string;
  kind: ReviewKind;
  path: string;
}): Promise<ReviewFm> {
  const slug = slugForPath(input.path);
  const fm: ReviewFm = {
    kind: input.kind,
    slug,
    feature: input.feature,
    path: input.path,
    state: "reviewing",
    updated_at: nowIso(),
  };
  return writeRecord(fm, NO_FEEDBACK);
}

export async function getReview(
  feature: string,
  kind: ReviewKind,
  slug: string,
): Promise<{ data: ReviewFm; content: string } | null> {
  const parsed = await readMarkdown<ReviewFm>(getPaths().featureReviewFile(feature, kind, slug));
  return parsed ? { data: parsed.data, content: parsed.content } : null;
}

export async function setReviewFeedback(
  feature: string,
  kind: ReviewKind,
  slug: string,
  feedback: string,
): Promise<ReviewFm | null> {
  const existing = await readMarkdown<ReviewFm>(getPaths().featureReviewFile(feature, kind, slug));
  if (!existing) return null;
  const fm: ReviewFm = { ...existing.data, state: "reviewing", updated_at: nowIso() };
  return writeRecord(fm, feedback);
}

export async function approveReview(
  feature: string,
  kind: ReviewKind,
  slug: string,
): Promise<ReviewFm | null> {
  const existing = await readMarkdown<ReviewFm>(getPaths().featureReviewFile(feature, kind, slug));
  if (!existing) return null;
  const fm: ReviewFm = { ...existing.data, state: "approved", updated_at: nowIso() };
  const feedback = existing.content.includes("## Feedback")
    ? existing.content.split("## Feedback")[1].trim() || NO_FEEDBACK
    : NO_FEEDBACK;
  return writeRecord(fm, feedback);
}

async function listFeatureReviews(feature: string): Promise<Array<ReviewPointer & { updated_at: string }>> {
  const files = await listFiles(getPaths().featureReviewsDir(feature), ".md");
  const out: Array<ReviewPointer & { updated_at: string }> = [];
  for (const file of files) {
    const parsed = await readMarkdown<ReviewFm>(
      path.join(getPaths().featureReviewsDir(feature), file),
    );
    if (!parsed) continue;
    out.push({
      feature: parsed.data.feature,
      kind: parsed.data.kind,
      slug: parsed.data.slug,
      path: parsed.data.path,
      state: parsed.data.state,
      updated_at: parsed.data.updated_at,
    });
  }
  return out;
}

export async function resolveReviewSlug(
  feature: string,
  kind: ReviewKind,
  slug?: string,
): Promise<string | null> {
  if (slug !== undefined && slug !== "") {
    const exists = await readMarkdown<ReviewFm>(getPaths().featureReviewFile(feature, kind, slug));
    return exists ? slug : null;
  }
  const ofKind = (await listFeatureReviews(feature)).filter((r) => r.kind === kind);
  return ofKind.length === 1 ? ofKind[0].slug : null;
}

export async function listReviews(state?: ReviewState): Promise<ReviewPointer[]> {
  const features = await listDirs(getPaths().featuresDir);
  const out: Array<ReviewPointer & { updated_at: string }> = [];
  for (const feature of features) {
    for (const r of await listFeatureReviews(feature)) {
      if (!state || r.state === state) out.push(r);
    }
  }
  out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return out.map(({ updated_at, ...rest }) => rest);
}
