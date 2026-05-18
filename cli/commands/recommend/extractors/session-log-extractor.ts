// ABOUTME: Summarizes recent Claude Code session activity into recommendation themes.
// ABOUTME: Tolerates absent or corrupt JSONL logs because session history is optional context.

import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { readTextFile } from "./file-utils";

const THEME_KEYWORDS: Array<[string, RegExp]> = [
  ["React", /\b(react|jsx|tsx|component|hook)\b/i],
  ["testing", /\b(test|testing|spec|jest|vitest|playwright|coverage)\b/i],
  ["database", /\b(database|sql|postgres|migration|schema|orm)\b/i],
  ["auth", /\b(auth|oauth|login|permission|session)\b/i],
  ["API", /\b(api|endpoint|request|response|graphql|rest)\b/i],
  ["deployment", /\b(deploy|ci|release|production|vercel|cloudflare)\b/i],
  ["performance", /\b(performance|latency|cache|optimi[sz]e|slow)\b/i],
  ["CLI", /\b(cli|command|terminal|args|flags)\b/i],
  ["documentation", /\b(doc|readme|markdown|documentation)\b/i],
];

export async function extractRecentSessionThemes(logsPath = join(homedir(), ".claude", "logs")): Promise<string[]> {
  const logFiles = await latestLogFiles(logsPath, 5);
  if (logFiles.length === 0) return [];

  const themeCounts = new Map<string, number>();
  let toolUseCount = 0;

  for (const file of logFiles) {
    const text = await readTextFile(file);
    if (!text) continue;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const content = collectText(entry);
        if (content) countThemes(content, themeCounts);
        toolUseCount += countToolUses(entry);
      } catch {
        continue;
      }
    }
  }

  if (toolUseCount > 0) themeCounts.set("tool-heavy workflow", (themeCounts.get("tool-heavy workflow") ?? 0) + toolUseCount);

  return [...themeCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([theme]) => theme);
}

async function latestLogFiles(logsPath: string, limit: number): Promise<string[]> {
  try {
    const entries = await readdir(logsPath);
    const stats = await Promise.all(
      entries
        .filter((name) => name.endsWith(".jsonl"))
        .map(async (name) => {
          const path = join(logsPath, name);
          return { path, stat: await stat(path) };
        }),
    );
    return stats
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
      .slice(0, limit)
      .map((entry) => entry.path);
  } catch {
    return [];
  }
}

function collectText(entry: Record<string, unknown>): string {
  const message = entry["message"] as Record<string, unknown> | undefined;
  const role = entry["role"] ?? message?.["role"];
  if (role !== "user" && role !== "assistant") return "";
  return flattenContent(entry["content"] ?? message?.["content"]);
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") return String((item as Record<string, unknown>)["text"] ?? "");
      return "";
    })
    .join(" ");
}

function countThemes(text: string, counts: Map<string, number>): void {
  for (const [theme, pattern] of THEME_KEYWORDS) {
    if (pattern.test(text)) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  }
}

function countToolUses(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countToolUses(item), 0);
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  const self = record["type"] === "tool_use" ? 1 : 0;
  return self + Object.values(record).reduce<number>((sum, item) => sum + countToolUses(item), 0);
}
