import { promises as fs } from "node:fs";
import path from "node:path";
import { makeVaultPaths, VaultPaths } from "./paths.js";
import { ensureDir, fileExists, readFileIfExists, writeAtomic } from "./atomic-write.js";
import { parse, stringify } from "./frontmatter.js";
import { log } from "../utils/logger.js";

let paths: VaultPaths | null = null;

export async function initVault(vaultRoot: string): Promise<VaultPaths> {
  paths = makeVaultPaths(vaultRoot);
  await ensureDir(paths.projectsDir);
  await ensureDir(paths.indexDir);
  if (!(await fileExists(paths.indexFile))) {
    await writeAtomic(paths.indexFile, JSON.stringify({ projects: {} }, null, 2));
  }
  // Drop a .obsidian marker so the folder can be opened as a vault out of the box.
  const dotObsidian = path.join(paths.root, ".obsidian");
  if (!(await fileExists(dotObsidian))) {
    await ensureDir(dotObsidian);
    await writeAtomic(path.join(dotObsidian, "app.json"), "{}");
  }
  log.info(`Vault ready at ${paths.root}`);
  return paths;
}

export function getPaths(): VaultPaths {
  if (!paths) throw new Error("Vault not initialized — call initVault() first.");
  return paths;
}

export async function readMarkdown<T = Record<string, unknown>>(filePath: string) {
  const raw = await readFileIfExists(filePath);
  if (raw === null) return null;
  return parse<T>(raw);
}

export async function writeMarkdown<T extends Record<string, unknown>>(
  filePath: string,
  data: T,
  body: string,
) {
  await writeAtomic(filePath, stringify(data, body));
}

export async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function deleteFile(filePath: string): Promise<void> {
  await fs.unlink(filePath);
}

export async function listFiles(dir: string, ext?: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && (!ext || e.name.endsWith(ext)))
      .map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
