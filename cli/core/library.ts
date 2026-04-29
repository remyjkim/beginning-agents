// ABOUTME: Builds the local reusable library view used by add/search/library commands.
// ABOUTME: Keeps user-facing inventory separate from downstream write and curation mechanics.

import { loadRegistry } from "./registry";
import { loadMcpLibrary } from "./mcp-library";
import { buildSkillInventory, type SkillScope } from "./skills";
import type { RegistryServer, UserMcpLibrary } from "./types";

export type LibrarySource = "repo" | "npm" | "registry" | "library";

export interface LibrarySkill {
  id: string;
  kind: "skill";
  name: string;
  scope: SkillScope;
  source: LibrarySource;
  sourceId?: string;
  sourceVersion?: string;
  path: string;
  curated: boolean;
}

export interface LibraryMcpServer {
  id: string;
  kind: "mcp";
  source: "registry" | "library";
  server: RegistryServer;
}

export async function listLibrarySkills(repoRoot: string, agentsDir: string, homeDir: string): Promise<LibrarySkill[]> {
  const inventory = await buildSkillInventory(repoRoot, agentsDir, homeDir);
  return inventory.map((skill) => ({
    id: skill.name,
    kind: "skill",
    name: skill.name,
    scope: skill.scope,
    source: skill.sourceType ?? "repo",
    sourceId: skill.sourceId,
    sourceVersion: skill.sourceVersion,
    path: skill.path,
    curated: skill.curated,
  }));
}

export async function findLibrarySkill(repoRoot: string, agentsDir: string, homeDir: string, name: string) {
  const skills = await listLibrarySkills(repoRoot, agentsDir, homeDir);
  return skills.find((skill) => skill.id === name) ?? null;
}

export async function listLibraryMcpServers(repoRoot: string, agentsDir?: string): Promise<LibraryMcpServer[]> {
  const emptyLibrary: UserMcpLibrary = { version: 1, servers: {} };
  const [registry, userLibrary] = await Promise.all([
    loadRegistry(repoRoot),
    agentsDir ? loadMcpLibrary(agentsDir) : Promise.resolve(emptyLibrary),
  ]);
  const builtIns = Object.entries(registry.servers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, server]) => ({ id, kind: "mcp" as const, source: "registry" as const, server }));
  const userServers = Object.entries(userLibrary.servers)
    .filter(([id]) => !registry.servers[id])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, server]) => ({ id, kind: "mcp" as const, source: "library" as const, server }));
  return [...builtIns, ...userServers];
}

export async function findLibraryMcpServer(repoRoot: string, name: string, agentsDir?: string) {
  const servers = await listLibraryMcpServers(repoRoot, agentsDir);
  return servers.find((server) => server.id === name) ?? null;
}
