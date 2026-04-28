// ABOUTME: Verifies search composition across local library and configured catalogs.
// ABOUTME: Protects source ordering and local-only/catalog-only semantics.

import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  cleanupTempRoots,
  createExecutable,
  createInstalledSkillBundle,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("core search", () => {
  test("returns local skill results before catalog results", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await createInstalledSkillBundle(fixture.agentsDir, { skillName: "alpha-helper" });
    const binDir = join(fixture.root, "bin");
    await createExecutable(binDir, "npm", 'printf "%s" \'[{"name":"@acme/alpha-skills","version":"1.0.0"}]\'');

    const { loadConfig } = await import("../cli/core/config");
    const { searchSkills } = await import("../cli/core/search");
    const result = await searchSkills({
      repoRoot: fixture.repoRoot,
      agentsDir: fixture.agentsDir,
      homeDir: fixture.homeDir,
      config: await loadConfig(fixture.repoRoot),
      query: "alpha",
      env: { PATH: binDir },
    });

    expect(result.results[0]?.sourceGroup).toBe("library");
    expect(result.results.some((item) => item.sourceGroup === "catalog")).toBe(true);
  });

  test("supports library-only and catalog-only skill search", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const binDir = join(fixture.root, "bin");
    await createExecutable(binDir, "npm", 'printf "%s" \'[{"name":"@acme/alpha-skills","version":"1.0.0"}]\'');

    const { loadConfig } = await import("../cli/core/config");
    const { searchSkills } = await import("../cli/core/search");
    const config = await loadConfig(fixture.repoRoot);
    const libraryOnly = await searchSkills({
      repoRoot: fixture.repoRoot,
      agentsDir: fixture.agentsDir,
      homeDir: fixture.homeDir,
      config,
      query: "alpha",
      libraryOnly: true,
      env: { PATH: binDir },
    });
    const catalogOnly = await searchSkills({
      repoRoot: fixture.repoRoot,
      agentsDir: fixture.agentsDir,
      homeDir: fixture.homeDir,
      config,
      query: "alpha",
      catalogOnly: true,
      env: { PATH: binDir },
    });

    expect(libraryOnly.results.every((item) => item.sourceGroup === "library")).toBe(true);
    expect(catalogOnly.results.every((item) => item.sourceGroup === "catalog")).toBe(true);
  });

  test("searches local MCP library and trusted MCP catalog files", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const catalogPath = join(fixture.root, "mcp-catalog.json");
    await Bun.write(
      catalogPath,
      JSON.stringify({
        servers: {
          github: {
            description: "GitHub",
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            optional: false,
          },
        },
      }),
    );
    const { loadConfig } = await import("../cli/core/config");
    const { searchMcp } = await import("../cli/core/search");
    const config = await loadConfig(fixture.repoRoot);
    config.catalogs = { mcp: { enabled: true, sources: [{ type: "file", path: catalogPath }] } };

    const result = await searchMcp({ repoRoot: fixture.repoRoot, config, query: "git" });

    expect(result.results.some((item) => item.id === "github" && item.sourceGroup === "catalog")).toBe(true);
  });
});
