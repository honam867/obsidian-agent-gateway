import { test } from "node:test";
import assert from "node:assert/strict";
import { planSlugFromTitle, projectSlugFromPath, slugify, taskIdFromIndex } from "../src/utils/slug.js";

test("slugify removes diacritics and special chars", () => {
  assert.equal(slugify("Tiếng Việt & Obsidian!"), "tieng-viet-obsidian");
});

test("planSlugFromTitle prepends the date", () => {
  assert.equal(planSlugFromTitle("Add OAuth login", "2026-04-22"), "2026-04-22-add-oauth-login");
});

test("projectSlugFromPath uses basename", () => {
  assert.equal(projectSlugFromPath("D:/working/my-project"), "my-project");
});

test("taskIdFromIndex zero-pads and slugifies", () => {
  assert.equal(taskIdFromIndex(3, "Design DB Schema"), "003-design-db-schema");
});
