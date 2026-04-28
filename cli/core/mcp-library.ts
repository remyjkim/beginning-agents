// ABOUTME: Stores user-registered reusable MCP server definitions.
// ABOUTME: Keeps MCP inventory separate from global defaults and project activation.

import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveMcpLibraryPath } from "./paths";
import type { RegistryServer, UserMcpLibrary } from "./types";

export { resolveMcpLibraryPath };

export function validateMcpLibraryServer(id: string, server: unknown): asserts server is RegistryServer {
  const candidate = server as Partial<RegistryServer> | undefined;
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`Invalid MCP server "${id}": expected object`);
  }
  if (!candidate.description || typeof candidate.description !== "string") {
    throw new Error(`Invalid MCP server "${id}": missing description`);
  }
  if (!candidate.transport || typeof candidate.transport !== "string") {
    throw new Error(`Invalid MCP server "${id}": missing transport`);
  }
  if (candidate.transport === "stdio" && (!candidate.command || typeof candidate.command !== "string")) {
    throw new Error(`Invalid MCP server "${id}": stdio transport requires command`);
  }
  if ((candidate.transport === "http" || candidate.transport === "sse") && (!candidate.url || typeof candidate.url !== "string")) {
    throw new Error(`Invalid MCP server "${id}": ${candidate.transport} transport requires url`);
  }
  if (typeof candidate.optional !== "boolean") {
    throw new Error(`Invalid MCP server "${id}": missing optional flag`);
  }
}

export function validateMcpLibrary(library: UserMcpLibrary) {
  if (library.version !== 1) {
    throw new Error(`Unsupported MCP library version: ${String(library.version)}`);
  }
  for (const [id, server] of Object.entries(library.servers ?? {})) {
    validateMcpLibraryServer(id, server);
  }
}

export async function loadMcpLibrary(agentsDir: string): Promise<UserMcpLibrary> {
  const path = resolveMcpLibraryPath(agentsDir);
  if (!existsSync(path)) {
    return { version: 1, servers: {} };
  }
  const parsed = JSON.parse(await readFile(path, "utf8")) as UserMcpLibrary;
  validateMcpLibrary(parsed);
  return parsed;
}

export async function saveMcpLibrary(agentsDir: string, library: UserMcpLibrary) {
  validateMcpLibrary(library);
  const path = resolveMcpLibraryPath(agentsDir);
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(library, null, 2)}\n`);
  return path;
}
