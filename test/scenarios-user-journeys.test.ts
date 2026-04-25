// ABOUTME: Models realistic first-time, migration, and drifted-environment user journeys against temp fixtures.
// ABOUTME: Protects the CLI against regressions in practical user workflows rather than isolated unit behavior alone.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, runAgentsCli, runSyncWrapper, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("user journeys", () => {
  test("first-time user can inspect, curate, and sync a skill", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    let result = await runAgentsCli(["status"], env);
    expect(result.exitCode).toBe(0);

    result = await runAgentsCli(["skills", "list"], env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("alpha");

    result = await runAgentsCli(["skills", "curate", "alpha"], env);
    expect(result.exitCode).toBe(0);

    result = await runAgentsCli(["skills", "sync"], env);
    expect(result.exitCode).toBe(0);
  });

  test("legacy wrapper user sees plausible equivalent dry-run intent", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    const legacy = await runSyncWrapper(["--dry-run"], env);
    const modern = await runAgentsCli(["sync", "--dry-run"], env);

    expect(legacy.exitCode).toBe(0);
    expect(modern.exitCode).toBe(0);
    expect(legacy.stdout).toContain("Changes:");
    expect(modern.stdout).toContain("Changes:");
  });

  test("drifted environment user gets drift, stale link, and missing generated file reports", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    await runAgentsCli(["skills", "sync"], env);
    await runAgentsCli(["skills", "uncurate", "alpha"], env);
    await writeFile(
      fixture.claudeSettings,
      JSON.stringify({ model: "sonnet", mcpServers: { rogue: { url: "x" } } }, null, 2),
    );
    await rm(join(fixture.agentsDir, "generated", "cursor-mcp.json"), { force: true });

    const result = await runAgentsCli(["doctor", "--json"], env);
    const parsed = JSON.parse(result.stdout) as {
      staleSkillSymlinks: string[];
      mcpDrift: string[];
      missingGeneratedFiles: string[];
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.staleSkillSymlinks.length).toBeGreaterThan(0);
    expect(parsed.mcpDrift.length).toBeGreaterThan(0);
    expect(parsed.missingGeneratedFiles.length).toBeGreaterThan(0);
  });
});
