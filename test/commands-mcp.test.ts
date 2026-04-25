// ABOUTME: Verifies the public `agents mcp list` and `agents mcp sync` command surfaces.
// ABOUTME: Protects canonical MCP listing and sync behavior while the CLI replaces ad hoc script usage.

import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("agents mcp", () => {
  test("list shows canonical servers and active state", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["mcp", "list"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("context7");
    expect(result.stdout).toContain("parallel-search");
  });

  test("list supports --json output", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["mcp", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ name: string; active: boolean }>;
    expect(parsed.some((server) => server.name === "parallel-search" && server.active)).toBe(true);
  });

  test("sync --dry-run reports changes without mutating target files", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);
    const before = await readFile(fixture.claudeSettings, "utf8");

    const result = await runAgentsCli(["mcp", "sync", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Changes:");
    expect(await readFile(fixture.claudeSettings, "utf8")).toBe(before);
  });

  test("sync --target=claude limits output scope", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["mcp", "sync", "--dry-run", "--target=claude"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("settings.json");
    expect(result.stdout).not.toContain("config.toml");
    expect(result.stdout).not.toContain("cursor");
  });

  test("inactive servers show empty targets", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["mcp", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    const parsed = JSON.parse(result.stdout) as Array<{ name: string; active: boolean; targets: string }>;
    const inactive = parsed.find((server) => !server.active);
    expect(inactive).toBeDefined();
    expect(inactive!.targets).toBe("");
  });
});
