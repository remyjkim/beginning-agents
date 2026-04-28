// ABOUTME: Verifies persistent user MCP library storage.
// ABOUTME: Protects reusable MCP inventory from activation/default policy.

import { afterEach, describe, expect, test } from "bun:test";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("core MCP library", () => {
  test("loads an absent library as an empty versioned registry", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { loadMcpLibrary } = await import("../cli/core/mcp-library");

    expect(await loadMcpLibrary(fixture.agentsDir)).toEqual({ version: 1, servers: {} });
  });

  test("saves and loads MCP library entries", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { loadMcpLibrary, saveMcpLibrary } = await import("../cli/core/mcp-library");

    await saveMcpLibrary(fixture.agentsDir, {
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

    expect((await loadMcpLibrary(fixture.agentsDir)).servers.github?.command).toBe("npx");
  });

  test("rejects invalid server definitions", async () => {
    const { validateMcpLibraryServer } = await import("../cli/core/mcp-library");

    expect(() => validateMcpLibraryServer("bad", { description: "Bad", optional: true })).toThrow("transport");
  });
});
