// ABOUTME: Aggregates skill finder results across refined queries.
// ABOUTME: Deduplicates by skill id while preserving the strongest relevance score.

import type { Skill } from "./types";

export interface AggregateSkillsOptions {
  existingPackages?: string[];
  installedSkills?: string[];
  installedMcpServers?: string[];
  onFiltered?: (count: number) => void;
}

export function aggregateSkills(
  skillsByQuery: Map<string, Skill[]> | Record<string, Skill[]>,
  targetLimit = 30,
  options: AggregateSkillsOptions = {},
): Skill[] {
  const groups = skillsByQuery instanceof Map ? [...skillsByQuery.values()] : Object.values(skillsByQuery);
  const byId = new Map<string, Skill>();

  // Combine all excluded items: existing packages + installed skills + installed MCP servers
  const excluded = new Set([
    ...(options.existingPackages ?? []),
    ...(options.installedSkills ?? []),
    ...(options.installedMcpServers ?? []),
  ].map(normalizePackageName));

  let filteredCount = 0;

  for (const skills of groups) {
    for (const skill of skills) {
      if (excluded.has(normalizePackageName(skill.name)) || excluded.has(normalizePackageName(skill.id))) {
        filteredCount += 1;
        continue;
      }
      const existing = byId.get(skill.id);
      if (!existing || skill.relevanceScore > existing.relevanceScore) {
        byId.set(skill.id, skill);
      }
    }
  }

  options.onFiltered?.(filteredCount);

  return [...byId.values()]
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.id.localeCompare(b.id))
    .slice(0, targetLimit);
}

function normalizePackageName(name: string): string {
  return name.trim().toLowerCase();
}
