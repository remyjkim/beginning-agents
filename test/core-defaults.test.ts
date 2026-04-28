// ABOUTME: Verifies default resolution helpers for skills and MCP servers.
// ABOUTME: Protects explicit defaults while preserving legacy fallback behavior.

import { describe, expect, test } from "bun:test";
import { createFixtureConfig, createFixtureRegistry } from "./helpers";

function paths() {
  return {
    claudeSettings: "/tmp/claude.json",
    codexConfig: "/tmp/codex.toml",
    cursorConfig: "/tmp/cursor.json",
  };
}

describe("core defaults", () => {
  test("falls back to current MCP activation when explicit defaults are absent", async () => {
    const { resolveDefaultMcpNames } = await import("../cli/core/defaults");
    const config = createFixtureConfig(paths(), false);
    const registry = createFixtureRegistry();

    expect(resolveDefaultMcpNames(config, registry)).toEqual(["context7"]);
  });

  test("explicit MCP defaults control active MCP names", async () => {
    const { resolveDefaultMcpNames, applyMcpDefaultsToConfig } = await import("../cli/core/defaults");
    const { buildActiveServers } = await import("../cli/core/mcp");
    const config = createFixtureConfig(paths(), true);
    config.defaults = { mcpServers: ["parallel-search"] };
    const registry = createFixtureRegistry();

    expect(resolveDefaultMcpNames(config, registry)).toEqual(["parallel-search"]);
    expect(Object.keys(buildActiveServers(registry, applyMcpDefaultsToConfig(config)))).toEqual(["parallel-search"]);
  });

  test("merges user MCP library entries without mutating built-in registry", async () => {
    const { mergeUserMcpLibrary } = await import("../cli/core/defaults");
    const registry = createFixtureRegistry();
    const merged = mergeUserMcpLibrary(registry, {
      version: 1,
      servers: {
        github: {
          description: "GitHub",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          optional: true,
        },
      },
    });

    expect(merged.servers.github?.command).toBe("npx");
    expect(registry.servers.github).toBeUndefined();
  });

  test("reports unknown default references", async () => {
    const { validateDefaultReferences } = await import("../cli/core/defaults");
    const config = createFixtureConfig(paths(), false);
    config.defaults = { skills: ["missing-skill"], mcpServers: ["missing-mcp"] };
    const issues = await validateDefaultReferences({
      config,
      registry: createFixtureRegistry(),
      skillNames: new Set(["alpha"]),
    });

    expect(issues).toContain('Unknown default skill: "missing-skill"');
    expect(issues).toContain('Unknown default MCP server: "missing-mcp"');
  });
});
