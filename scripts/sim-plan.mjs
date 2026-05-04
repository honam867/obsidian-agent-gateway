import { initVault } from "../dist/src/vault/vault-io.js";
import { loadConfig } from "../dist/src/config.js";
import { resolveOrRegisterProject } from "../dist/src/domain/project.js";
import { createPlan, listTaskRefs, renderPlanBody } from "../dist/src/domain/plan.js";
import { planReviseTool } from "../dist/src/tools/plan-revise.js";
import path from "node:path";
import { promises as fs } from "node:fs";

const TEST_CWD = "D:\\working\\test-plan-toc";

async function main() {
  await fs.mkdir(TEST_CWD, { recursive: true });

  const cfg = loadConfig();
  await initVault(cfg.vaultPath);

  const project = await resolveOrRegisterProject(path.resolve(TEST_CWD));
  console.log("Project:", project.slug);

  const content = `Plan test cho workflow TOC-only — 5 marker Task, lorem ngắn.

## Task: Setup database schema
- Acceptance: tables users/orders/products ready
- Lorem ipsum dolor sit amet, consectetur adipiscing elit.
- Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## Task: Implement auth module
- Acceptance: login, logout, refresh token hoạt động
- Ut enim ad minim veniam, quis nostrud exercitation.

## Task: Build REST API endpoints
- Acceptance: 10 endpoint CRUD cho orders
- Duis aute irure dolor in reprehenderit voluptate velit.

## Task: Add rate limiting
- Acceptance: 100 req/min per user
- Excepteur sint occaecat cupidatat non proident.

## Task: Write integration tests
- Acceptance: coverage ≥ 80%
- Sunt in culpa qui officia deserunt mollit anim.
`;

  const result = await createPlan(
    { projectSlug: project.slug, title: "demo-toc-only", content },
    cfg,
  );
  console.log("\n=== createPlan result ===");
  console.log("plan_id:", result.plan.id);
  console.log("strategy:", result.strategy);
  console.log("task_ids:", result.taskIds);
  console.log("warning:", result.warning ?? "(none)");

  const planDir = path.join(
    cfg.vaultPath,
    "projects",
    project.slug,
    "plans",
    result.plan.id,
  );
  console.log("\n=== Files created ===");
  await printTree(planDir);

  console.log("\n=== plan.md content ===");
  const planText = await fs.readFile(path.join(planDir, "plan.md"), "utf8");
  console.log(planText);

  console.log("\n=== Sample task 001 content ===");
  const task1Files = (await fs.readdir(path.join(planDir, "tasks"))).filter((f) =>
    f.startsWith("001-"),
  );
  if (task1Files[0]) {
    const t1 = await fs.readFile(path.join(planDir, "tasks", task1Files[0]), "utf8");
    console.log(t1);
  }

  // Now test plan_revise with a short note
  const revise = planReviseTool({ config: cfg });
  const revised = await revise.handler({
    cwd: TEST_CWD,
    plan_id: result.plan.id,
    note: "Đổi thứ tự ưu tiên: auth trước DB vì blocker.",
    reason: "replan after standup",
  });
  console.log("\n=== after plan_revise ===");
  console.log("version:", revised.plan.version);
  const planText2 = await fs.readFile(path.join(planDir, "plan.md"), "utf8");
  console.log(planText2);

  console.log("\n=== FOLDER LEFT FOR INSPECTION ===");
  console.log(planDir);
}

async function printTree(root, depth = 0) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(root, e.name);
    const stat = e.isDirectory() ? "/" : "";
    let size = "";
    if (e.isFile()) {
      const s = await fs.stat(p);
      size = ` (${s.size} bytes)`;
    }
    console.log("  ".repeat(depth) + e.name + stat + size);
    if (e.isDirectory()) await printTree(p, depth + 1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
