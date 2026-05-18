// Detects installed skills and MCP tools across all environments
// Scans ~/.claude/skills, ~/.cursor/skills-cursor, ~/.codex/skills
// Also parses MCP server configs from ~/.codex/config.toml

import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { parse as parseToml } from "smol-toml";
import { pathExists, readTextFile, uniqueSorted } from "./file-utils";

export interface InstalledTools {
  skills: string[];
  mcpServers: string[];
  all: string[];
}

export async function detectInstalledTools(): Promise<InstalledTools> {
  const home = homedir();

  const [claudeSkills, cursorSkills, codexSkills, mcpServers] = await Promise.all([
    scanSkillsDirectory(join(home, ".claude", "skills")),
    scanSkillsDirectory(join(home, ".cursor", "skills-cursor")),
    scanSkillsDirectory(join(home, ".codex", "skills")),
    extractMcpServers(join(home, ".codex", "config.toml")),
  ]);

  const allSkills = uniqueSorted([...claudeSkills, ...cursorSkills, ...codexSkills]);
  const allTools = uniqueSorted([...allSkills, ...mcpServers]);

  return {
    skills: allSkills,
    mcpServers,
    all: allTools,
  };
}

async function scanSkillsDirectory(path: string): Promise<string[]> {
  if (!(await pathExists(path))) return [];

  try {
    const entries = await readdir(path);
    // Each subdirectory name is a skill (e.g., "agent-eval", "tdd", etc.)
    return entries.filter((name) => !name.startsWith("."));
  } catch {
    return [];
  }
}

async function extractMcpServers(configPath: string): Promise<string[]> {
  const content = await readTextFile(configPath);
  if (!content) return [];

  try {
    const config = parseToml(content) as Record<string, unknown>;
    const mcpServers = config["mcp_servers"] as Record<string, unknown> | undefined;

    if (!mcpServers || typeof mcpServers !== "object") return [];

    // Extract MCP server names from the config
    return Object.keys(mcpServers).filter((key) => !key.startsWith("."));
  } catch {
    return [];
  }
}

/**
 * Checks if a skill is already installed
 * Useful for filtering recommendations
 */
export async function isSkillInstalled(skillName: string): Promise<boolean> {
  const tools = await detectInstalledTools();
  return tools.all.some((tool) => tool.toLowerCase() === skillName.toLowerCase());
}

/**
 * Filters out already-installed skills from a list of recommendations
 */
export async function filterOutInstalledSkills(skillNames: string[]): Promise<string[]> {
  const tools = await detectInstalledTools();
  const installedLower = new Set(tools.all.map((s) => s.toLowerCase()));
  return skillNames.filter((skill) => !installedLower.has(skill.toLowerCase()));
}
