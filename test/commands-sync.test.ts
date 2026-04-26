// ABOUTME: Verifies the top-level `agents sync` convenience command for full sync workflows.
// ABOUTME: Protects migration behavior from the legacy sync-mcp wrapper into the new CLI surface.

import { afterEach, describe, expect, test } from "bun:test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
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

  test("applies project config server and target overrides", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "bgng", "config.json");
    await mkdir(dirname(projectConfigPath), { recursive: true });
    await writeFile(
      projectConfigPath,
      JSON.stringify(
        {
          version: 1,
          servers: {
            context7: { enabled: false },
            localdb: {
              description: "Project DB",
              transport: "stdio",
              command: "node",
              args: ["db-mcp.js"],
              optional: false,
            },
          },
          targets: {
            codex: { enabled: false },
          },
        },
        null,
        2,
      ),
    );

    const result = await runAgentsCli(["sync"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(projectConfigPath);
    expect(result.stdout).not.toContain("config.toml");

    const claudeSettings = JSON.parse(await readFile(fixture.claudeSettings, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(claudeSettings.mcpServers.context7).toBeUndefined();
    expect(claudeSettings.mcpServers.localdb).toBeDefined();
  });
});
