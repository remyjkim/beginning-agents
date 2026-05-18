// ABOUTME: Provides small filesystem helpers shared by context extractors.
// ABOUTME: Keeps extractors resilient when project files are missing or malformed.

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export const EMPTY_CONTEXT = {
  readmeSummary: "",
  languages: {},
  frameworks: [],
  runtimes: { runtimes: [], packageManagers: [] },
  existingPackages: [],
  recentSessionThemes: [],
  installedSkills: [],
  installedMcpServers: [],
};

const IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".turbo",
  ".vercel",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "target",
  "vendor",
]);

export async function readTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
  const text = await readTextFile(path);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function listFiles(root: string, options: { limit?: number; includeHidden?: boolean } = {}): Promise<string[]> {
  const limit = options.limit ?? 5_000;
  const files: string[] = [];

  async function visit(dir: string): Promise<void> {
    if (files.length >= limit) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= limit) return;
      if (!options.includeHidden && entry.name.startsWith(".")) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await visit(fullPath);
      } else if (entry.isFile()) {
        files.push(relative(root, fullPath));
      }
    }
  }

  await visit(root);
  return files;
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
