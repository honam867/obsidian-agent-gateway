import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { initVault } from "../src/vault/vault-io.js";
import {
  openReview,
  setReviewFeedback,
  approveReview,
  getReview,
  resolveReviewSlug,
  listReviews,
  slugForPath,
} from "../src/domain/review.js";

async function freshVault() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oag-review-"));
  await initVault(dir);
}

test("slugForPath derives a kebab slug from the basename", () => {
  assert.equal(slugForPath("D:/x/docs/2026-OAuth Login.md"), "2026-oauth-login");
});

test("openReview creates a reviewing record", async () => {
  await freshVault();
  const fm = await openReview({ feature: "misa-payout", kind: "spec", path: "D:/x/oauth.md" });
  assert.equal(fm.kind, "spec");
  assert.equal(fm.slug, "oauth");
  assert.equal(fm.state, "reviewing");
  assert.equal(fm.path, "D:/x/oauth.md");
});

test("setReviewFeedback overwrites feedback and keeps reviewing", async () => {
  await freshVault();
  await openReview({ feature: "f1", kind: "spec", path: "D:/x/a.md" });
  await setReviewFeedback("f1", "spec", "a", "Thiếu refresh token.");
  let got = await getReview("f1", "spec", "a");
  assert.match(got?.content ?? "", /refresh token/);
  await setReviewFeedback("f1", "spec", "a", "Bản mới: thêm rate-limit.");
  got = await getReview("f1", "spec", "a");
  assert.match(got?.content ?? "", /rate-limit/);
  assert.doesNotMatch(got?.content ?? "", /refresh token/); // overwrite, no history
  assert.equal(got?.data.state, "reviewing");
});

test("approveReview flips state; missing record returns null", async () => {
  await freshVault();
  await openReview({ feature: "f1", kind: "spec", path: "D:/x/a.md" });
  const ok = await approveReview("f1", "spec", "a");
  assert.equal(ok?.state, "approved");
  assert.equal(await approveReview("f1", "spec", "ghost"), null);
});

test("resolveReviewSlug returns the sole record when slug omitted", async () => {
  await freshVault();
  await openReview({ feature: "f1", kind: "spec", path: "D:/x/only.md" });
  assert.equal(await resolveReviewSlug("f1", "spec"), "only");
  await openReview({ feature: "f1", kind: "spec", path: "D:/x/second.md" });
  assert.equal(await resolveReviewSlug("f1", "spec"), null); // ambiguous
  assert.equal(await resolveReviewSlug("f1", "spec", "second"), "second");
});

test("listReviews scans all features and filters by state", async () => {
  await freshVault();
  await openReview({ feature: "fa", kind: "spec", path: "D:/x/a.md" });
  await openReview({ feature: "fb", kind: "plan", path: "D:/x/b.md" });
  await approveReview("fb", "plan", "b");
  const reviewing = await listReviews("reviewing");
  assert.deepEqual(reviewing.map((r) => r.feature), ["fa"]);
  const all = await listReviews();
  assert.equal(all.length, 2);
});
