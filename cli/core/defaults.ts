// ABOUTME: Resolves user global defaults for skills and MCP servers.
// ABOUTME: Keeps default policy separate from reusable library inventory.

import type { CanonicalConfig, CanonicalRegistry, UserMcpLibrary } from "./types";

function isParallelMcpName(name: string) {
  return name === "parallel-search" || name === "parallel-task";
}

export function resolveDefaultSkillNames(config: CanonicalConfig): string[] {
  return [...(config.defaults?.skills ?? [])];
}

export function resolveDefaultMcpNames(config: CanonicalConfig, registry: CanonicalRegistry): string[] {
  if (config.defaults?.mcpServers) {
    return [...config.defaults.mcpServers];
  }

  return Object.entries(registry.servers)
    .filter(([name, server]) => {
      if (server.transport === "platform-provided") {
        return false;
      }
      if (isParallelMcpName(name)) {
        return config.parallel?.mcp?.enabled === true;
      }
      return !server.optional || config.optional[name] === true;
    })
    .map(([name]) => name);
}

export function applyMcpDefaultsToConfig(config: CanonicalConfig): CanonicalConfig {
  if (!config.defaults?.mcpServers) {
    return config;
  }

  const next: CanonicalConfig = JSON.parse(JSON.stringify(config));
  const defaults = new Set(next.defaults?.mcpServers ?? []);
  next.optional = {};
  for (const name of defaults) {
    next.optional[name] = true;
  }
  next.parallel ??= {};
  next.parallel.mcp = {
    ...(next.parallel.mcp ?? {}),
    enabled: defaults.has("parallel-search") || defaults.has("parallel-task"),
  };
  return next;
}

export function mergeUserMcpLibrary(registry: CanonicalRegistry, library: UserMcpLibrary): CanonicalRegistry {
  return {
    version: registry.version,
    servers: {
      ...registry.servers,
      ...library.servers,
    },
  };
}

export async function validateDefaultReferences(options: {
  config: CanonicalConfig;
  registry: CanonicalRegistry;
  skillNames: Set<string>;
}) {
  const issues: string[] = [];
  for (const name of options.config.defaults?.skills ?? []) {
    if (!options.skillNames.has(name)) {
      issues.push(`Unknown default skill: "${name}"`);
    }
  }
  for (const name of options.config.defaults?.mcpServers ?? []) {
    if (!options.registry.servers[name]) {
      issues.push(`Unknown default MCP server: "${name}"`);
    }
  }
  return issues;
}

export function addDefaultValue(values: string[] | undefined, value: string) {
  const next = [...(values ?? [])];
  if (!next.includes(value)) {
    next.push(value);
  }
  return next;
}

export function removeDefaultValue(values: string[] | undefined, value: string) {
  return [...(values ?? [])].filter((item) => item !== value);
}
