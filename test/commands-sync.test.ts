// ABOUTME: Verifies the top-level `agents sync` convenience command for full sync workflows.
// ABOUTME: Protects migration behavior from the legacy sync-mcp wrapper into the new CLI surface.

import { afterEach, describe, expect, test } from "bun:test";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("agents sync", () => {
  test("runs both MCP and skill sync", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["sync", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Changes:");
  });

  test("supports --target and --dry-run flags", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["sync", "--dry-run", "--target=claude"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("config.toml");
  });

  test("supports --json output", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["sync", "--dry-run", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { changes: string[]; warnings: string[] };
    expect(parsed.changes).toBeDefined();
    expect(parsed.warnings).toBeDefined();
  });
});
