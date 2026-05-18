// ABOUTME: Aggregates all project-context extractors behind a single API.
// ABOUTME: Allows partial context when one extractor fails or optional data is absent.

import { parseExistingPackages } from "./dependency-parser";
import { detectFrameworks } from "./framework-detector";
import { detectLanguages } from "./language-detector";
import { parseReadmeSummary } from "./readme-parser";
import { detectRuntimes } from "./runtime-detector";
import { extractRecentSessionThemes } from "./session-log-extractor";
import { detectInstalledTools } from "./skills-mcp-detector";
import { EMPTY_CONTEXT } from "./file-utils";
import type { ProjectContext } from "../types";

export async function extractProjectContext(repoPath: string): Promise<ProjectContext> {
  const [readmeSummary, languages, frameworks, runtimes, existingPackages, recentSessionThemes, installedTools] = await Promise.all([
    fallback(parseReadmeSummary(repoPath), EMPTY_CONTEXT.readmeSummary),
    fallback(detectLanguages(repoPath), EMPTY_CONTEXT.languages),
    fallback(detectFrameworks(repoPath), EMPTY_CONTEXT.frameworks),
    fallback(detectRuntimes(repoPath), EMPTY_CONTEXT.runtimes),
    fallback(parseExistingPackages(repoPath), EMPTY_CONTEXT.existingPackages),
    fallback(extractRecentSessionThemes(), EMPTY_CONTEXT.recentSessionThemes),
    fallback(detectInstalledTools(), { skills: [], mcpServers: [], all: [] }),
  ]);

  return {
    readmeSummary,
    languages,
    frameworks,
    runtimes,
    existingPackages,
    recentSessionThemes,
    installedSkills: installedTools.skills,
    installedMcpServers: installedTools.mcpServers,
  };
}

async function fallback<T>(promise: Promise<T>, value: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return value;
  }
}

export { parseExistingPackages } from "./dependency-parser";
export { detectFrameworks } from "./framework-detector";
export { detectLanguages } from "./language-detector";
export { parseReadmeSummary } from "./readme-parser";
export { detectRuntimes } from "./runtime-detector";
export { extractRecentSessionThemes } from "./session-log-extractor";
export { detectInstalledTools, isSkillInstalled, filterOutInstalledSkills } from "./skills-mcp-detector";
