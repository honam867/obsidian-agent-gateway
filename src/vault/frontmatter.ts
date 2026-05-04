import matter from "gray-matter";

export interface Parsed<T> {
  data: T;
  content: string;
}

export function parse<T = Record<string, unknown>>(raw: string): Parsed<T> {
  const result = matter(raw);
  return { data: (result.data ?? {}) as T, content: result.content.trimStart() };
}

export function stringify<T extends Record<string, unknown>>(data: T, body: string): string {
  return matter.stringify(body, data);
}
