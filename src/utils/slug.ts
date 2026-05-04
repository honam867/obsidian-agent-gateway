import path from "node:path";

const MAX_LEN = 60;

export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) return "untitled";
  return base.length > MAX_LEN ? base.slice(0, MAX_LEN).replace(/-+$/g, "") : base;
}

export function projectSlugFromPath(absPath: string): string {
  const name = path.basename(path.resolve(absPath));
  return slugify(name) || "project";
}

export function planSlugFromTitle(title: string, datePrefix: string): string {
  return `${datePrefix}-${slugify(title)}`;
}

export function taskIdFromIndex(index: number, title: string): string {
  const n = String(index).padStart(3, "0");
  return `${n}-${slugify(title)}`;
}
