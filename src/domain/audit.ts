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
  void projectSlug;
  void planId;
  void evt;
}
