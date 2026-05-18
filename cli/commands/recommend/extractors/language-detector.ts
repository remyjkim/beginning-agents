// ABOUTME: Estimates GitHub-style repository language percentages from file extensions.
// ABOUTME: Uses bounded recursive scanning to stay fast on large working trees.

import { extname } from "node:path";
import { listFiles } from "./file-utils";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".c": "C",
  ".cpp": "C++",
  ".cs": "C#",
  ".css": "CSS",
  ".go": "Go",
  ".html": "HTML",
  ".java": "Java",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".kt": "Kotlin",
  ".m": "Objective-C",
  ".mm": "Objective-C++",
  ".php": "PHP",
  ".py": "Python",
  ".rb": "Ruby",
  ".rs": "Rust",
  ".scala": "Scala",
  ".sh": "Shell",
  ".swift": "Swift",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".vue": "Vue",
};

export async function detectLanguages(repoPath: string): Promise<Record<string, number>> {
  const files = await listFiles(repoPath, { limit: 6_000 });
  const counts = new Map<string, number>();

  for (const file of files) {
    const language = LANGUAGE_BY_EXTENSION[extname(file).toLowerCase()];
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) return {};

  return Object.fromEntries(
    [...counts.entries()]
      .map(([language, count]) => [language, Math.round((count / total) * 100)] as const)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}
