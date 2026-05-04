import type { TaskStatus } from "../schemas/task.js";

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ["active", "done"],
  active: ["in_progress", "blocked", "done"],
  in_progress: ["active", "blocked", "done"],
  blocked: ["in_progress", "active", "done"],
  done: ["in_progress"], // reopen
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid task transition: ${from} → ${to}`);
  }
}
