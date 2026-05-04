import { promises as fs } from "node:fs";
import path from "node:path";
import writeFileAtomic from "write-file-atomic";

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeAtomic(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFileAtomic(filePath, content, { encoding: "utf8" });
}

export async function appendLine(filePath: string, line: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, line.endsWith("\n") ? line : line + "\n", "utf8");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
