import { getPaths, readMarkdown, writeMarkdown } from "../vault/vault-io.js";
import { nowIso } from "../utils/time.js";

export interface ProgressInput {
  feature: string;
  lastAction: string;
  nextStep: string;
  activeTask?: string;
  session?: string;
}

export interface Progress {
  feature: string;
  session: string | null;
  updated_at: string;
  active_task: string | null;
  last_action: string;
  next_step: string;
}

export async function writeProgress(input: ProgressInput): Promise<Progress> {
  const progress: Progress = {
    feature: input.feature,
    session: input.session ?? null,
    updated_at: nowIso(),
    active_task: input.activeTask ?? null,
    last_action: input.lastAction,
    next_step: input.nextStep,
  };
  const body = [
    `# Working memory — ${input.feature}`,
    "",
    `**Last action:** ${input.lastAction}`,
    "",
    `**Next step:** ${input.nextStep}`,
    "",
  ].join("\n");
  await writeMarkdown(
    getPaths().featureCurrentFile(input.feature),
    progress as unknown as Record<string, unknown>,
    body,
  );
  return progress;
}

export async function readProgress(feature: string): Promise<Progress | null> {
  const parsed = await readMarkdown<Progress>(getPaths().featureCurrentFile(feature));
  return parsed?.data ?? null;
}
