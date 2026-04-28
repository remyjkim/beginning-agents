// ABOUTME: Manages user-owned global bgng config under ~/.agents/bgng.
// ABOUTME: Initializes defaults from packaged config while preserving existing compatibility state.

import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveUserBgngDir, resolveUserConfigPath } from "./paths";
import { listCuratedSkills } from "./skills";
import { resolveDefaultMcpNames } from "./defaults";
import type { CanonicalConfig, CanonicalRegistry } from "./types";

export { resolveUserBgngDir, resolveUserConfigPath };

export async function loadUserConfig(path: string): Promise<CanonicalConfig> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as CanonicalConfig;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported user config version: ${String(parsed.version)}`);
  }
  return parsed;
}

export async function saveUserConfig(path: string, config: CanonicalConfig) {
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}

export async function initializeUserConfigFromPackagedDefaults(
  packagedConfig: CanonicalConfig,
  registry: CanonicalRegistry,
  agentsDir?: string,
): Promise<CanonicalConfig> {
  const next: CanonicalConfig = JSON.parse(JSON.stringify(packagedConfig));
  const curated = agentsDir ? await listCuratedSkills(agentsDir) : [];
  next.defaults = {
    ...(next.defaults ?? {}),
    skills: next.defaults?.skills ?? curated.map((skill) => skill.name),
    mcpServers: next.defaults?.mcpServers ?? resolveDefaultMcpNames(packagedConfig, registry),
    extensions: next.defaults?.extensions ?? {},
  };
  return next;
}

export async function loadOrInitializeUserConfig(options: {
  repoConfig: CanonicalConfig;
  registry: CanonicalRegistry;
  agentsDir: string;
}) {
  const path = resolveUserConfigPath(options.agentsDir);
  if (existsSync(path)) {
    return { path, config: await loadUserConfig(path), created: false };
  }
  const config = await initializeUserConfigFromPackagedDefaults(options.repoConfig, options.registry, options.agentsDir);
  return { path, config, created: true };
}

export async function loadEffectiveConfig(repoConfig: CanonicalConfig, agentsDir: string) {
  const path = resolveUserConfigPath(agentsDir);
  if (!existsSync(path)) {
    return { config: repoConfig, userConfigPath: null };
  }
  return { config: await loadUserConfig(path), userConfigPath: path };
}
