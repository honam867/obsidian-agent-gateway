import { appendLine } from "../vault/atomic-write.js";
import { getPaths } from "../vault/vault-io.js";

export interface AuditEvent {
  at: string;
  event: string;
  entity: string;
  entityId: string;
  session?: string;
  payload?: Record<string, unknown>;
}

export async function logEvent(
  projectSlug: string,
  planId: string,
  evt: Omit<AuditEvent, "at"> & { at?: string },
): Promise<void> {
  const at = evt.at ?? new Date().toISOString();
  const yearMonth = at.slice(0, 7); // YYYY-MM
  const file = getPaths().auditFile(projectSlug, planId, yearMonth);
  const record: AuditEvent = { ...evt, at };
  await appendLine(file, JSON.stringify(record));
}
