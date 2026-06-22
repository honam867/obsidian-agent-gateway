import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { makeVaultPaths } from "../src/vault/paths.js";

const root = path.resolve("/vault");
const p = makeVaultPaths("/vault");

test("review paths", () => {
  assert.equal(p.featureReviewsDir("misa-payout"), path.join(root, "features", "misa-payout", "reviews"));
  assert.equal(
    p.featureReviewFile("misa-payout", "spec", "oauth-login"),
    path.join(root, "features", "misa-payout", "reviews", "spec-oauth-login.md"),
  );
});
