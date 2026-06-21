import { agentBootTool } from "./agent-boot.js";
import { planCreateTool } from "./plan-create.js";
import { planReviseTool } from "./plan-revise.js";
import { planArchiveTool } from "./plan-archive.js";
import { planListTool } from "./plan-list.js";
import { taskAddTool } from "./task-add.js";
import { taskEditTool } from "./task-edit.js";
import { taskDeleteTool } from "./task-delete.js";
import { taskUpdateTool } from "./task-update.js";
import { taskCompleteTool } from "./task-complete.js";
import { taskGetTool } from "./task-get.js";
import { taskListTool } from "./task-list.js";
import { reviewSubmitTool } from "./review-submit.js";
import { projectRelinkTool } from "./project-relink.js";
import { contextSetTool } from "./context-set.js";
import { progressUpdateTool } from "./progress-update.js";
import { memoryRecallTool } from "./memory-recall.js";
import { knowledgeSaveTool } from "./knowledge-save.js";
import { instinctSaveTool } from "./instinct-save.js";
import { agentRecallTool } from "./agent-recall.js";
import { lessonSaveTool } from "./lesson-save.js";
import { lessonGetTool } from "./lesson-get.js";
import { playbookSaveTool } from "./playbook-save.js";
import { playbookGetTool } from "./playbook-get.js";
import { memoryPromoteTool } from "./memory-promote.js";
import type { ToolContext, ToolDef } from "./types.js";

export function registerTools(ctx: ToolContext): ToolDef[] {
  return [
    agentBootTool(ctx),
    planCreateTool(ctx),
    planReviseTool(ctx),
    planArchiveTool(ctx),
    planListTool(ctx),
    taskAddTool(ctx),
    taskEditTool(ctx),
    taskDeleteTool(ctx),
    taskUpdateTool(ctx),
    taskCompleteTool(ctx),
    taskGetTool(ctx),
    taskListTool(ctx),
    reviewSubmitTool(ctx),
    projectRelinkTool(ctx),
    contextSetTool(ctx),
    progressUpdateTool(ctx),
    memoryRecallTool(ctx),
    knowledgeSaveTool(ctx),
    instinctSaveTool(ctx),
    agentRecallTool(ctx),
    lessonSaveTool(ctx),
    lessonGetTool(ctx),
    playbookSaveTool(ctx),
    playbookGetTool(ctx),
    memoryPromoteTool(ctx),
  ];
}
