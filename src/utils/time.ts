export function nowIso(): string {
  return new Date().toISOString();
}

export function localDateSlug(tz: string, at: Date = new Date()): string {
  // Returns YYYY-MM-DD in the given IANA timezone.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(at);
}

export function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

export function isSameLocalDay(iso: string, tz: string, reference: Date = new Date()): boolean {
  return localDateSlug(tz, new Date(iso)) === localDateSlug(tz, reference);
}
