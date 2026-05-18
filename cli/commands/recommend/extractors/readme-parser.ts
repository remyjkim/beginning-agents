// ABOUTME: Extracts a concise project summary from README or package metadata.
// ABOUTME: Fails closed so missing or malformed docs do not block recommendations.

import { join } from "node:path";
import { readJsonFile, readTextFile } from "./file-utils";

interface PackageJson {
  description?: string;
}

export async function parseReadmeSummary(repoPath: string): Promise<string> {
  const readme = await readTextFile(join(repoPath, "README.md"));
  if (readme) {
    const summary = summarizeReadme(readme);
    if (summary) return summary;
  }

  const pkg = await readJsonFile<PackageJson>(join(repoPath, "package.json"));
  return pkg?.description?.trim() ?? "";
}

function summarizeReadme(readme: string): string {
  const lines = readme.split(/\r?\n/);
  const title = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim();
  const paragraph = firstParagraph(lines);
  return [title, paragraph].filter(Boolean).join(": ");
}

function firstParagraph(lines: string[]): string {
  const paragraph: string[] = [];
  let passedTitle = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^#\s+/.test(line) && !passedTitle) {
      passedTitle = true;
      continue;
    }
    if (line.startsWith("#") || line.startsWith("!") || line.startsWith("[!")) continue;
    paragraph.push(line);
  }

  return paragraph.join(" ").replace(/\s+/g, " ").trim();
}
