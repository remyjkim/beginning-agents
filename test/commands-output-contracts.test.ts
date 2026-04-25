// ABOUTME: Verifies human-readable and JSON output contracts for the implemented public commands.
// ABOUTME: Protects stable operator-facing and machine-readable command surfaces across the CLI.

import { afterEach, describe, expect, test } from "bun:test";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("command output contracts", () => {
  test("human outputs are non-empty and json outputs are parseable", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    const humanCommands = [
      ["sync", "--dry-run"],
      ["skills", "list"],
      ["skills", "sync", "--dry-run"],
      ["mcp", "list"],
      ["mcp", "sync", "--dry-run"],
      ["status"],
      ["doctor"],
    ];

    for (const args of humanCommands) {
      const result = await runAgentsCli(args, env);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim().length).toBeGreaterThan(0);
      expect(result.stdout).not.toContain("[object Object]");
      expect(result.stdout).not.toContain("Error:");
    }

    const jsonCommands = [
      ["sync", "--dry-run", "--json"],
      ["skills", "list", "--json"],
      ["skills", "sync", "--dry-run", "--json"],
      ["mcp", "list", "--json"],
      ["mcp", "sync", "--dry-run", "--json"],
      ["status", "--json"],
      ["doctor", "--json"],
    ];

    for (const args of jsonCommands) {
      const result = await runAgentsCli(args, env);
      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    }
  });
});
