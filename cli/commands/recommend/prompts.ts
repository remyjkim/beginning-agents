// ABOUTME: Stores the Mastra query expansion prompt and default generation settings.
// ABOUTME: Constrains context-aware query generation to three deliberate search angles.

import type { MastraQueryGeneratorConfig, ProjectContext } from "./types";

export const DEFAULT_MASTRA_QUERY_CONFIG: MastraQueryGeneratorConfig = {
  model: "minimax/minimax-text-01",
  temperature: 0.2,
  maxQueries: 3,
  timeoutMs: 5_000,
};

export const PRODUCTION_MASTRA_QUERY_CONFIG: MastraQueryGeneratorConfig = {
  model: "minimax/minimax-text-01",
  temperature: 0.2,
  maxQueries: 3,
  timeoutMs: 5_000,
};

export const QUERY_GENERATOR_SYSTEM_PROMPT = [
  "You are the Query Generator block in a skill recommendation pipeline.",
  "Generate EXACTLY 3 concise search queries for the user's skill discovery request.",
  "Return JSON only: an array of 3 strings.",
  "Each query must explore a distinct search strategy:",
  "1. Library or package names",
  "2. Problem-solution wording",
  "3. Pattern, framework, or use cases",
  "IMPORTANT: NEVER recommend packages already in the project (they'll be listed below).",
  "IMPORTANT: Consider recent work themes when they clarify the user's intent.",
  "Keep each query under 12 words, no explanations, exactly 3 queries total.",
].join("\n");

export function buildQueryGeneratorPrompt(originalQuery: string, context?: ProjectContext): string {
  if (!context) return originalQuery ? `User query: ${originalQuery}` : "Generate skill recommendations based on project context only.";

  const lines = [];
  if (originalQuery) {
    lines.push(`User query: ${originalQuery}`);
  } else {
    lines.push("No specific user query provided. Generate skill recommendations based on project context only.");
  }

  lines.push(
    "",
    "Project context:",
    `Summary: ${context.readmeSummary || "unknown"}`,
    `Languages: ${formatLanguages(context.languages) || "unknown"}`,
    `Frameworks: ${context.frameworks.join(", ") || "unknown"}`,
    `Runtimes: ${context.runtimes.runtimes.join(", ") || "unknown"}`,
    `Package managers: ${context.runtimes.packageManagers.join(", ") || "unknown"}`,
    `Existing packages (DO NOT recommend): ${context.existingPackages.join(", ") || "none"}`,
    `Recent work themes: ${context.recentSessionThemes.join(", ") || "none"}`,
  );

  return lines.join("\n");
}

function formatLanguages(languages: Record<string, number>): string {
  return Object.entries(languages)
    .map(([language, percent]) => `${language}: ${percent}%`)
    .join(", ");
}
