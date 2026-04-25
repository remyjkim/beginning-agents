// ABOUTME: Verifies the public `agents status` command in human and JSON modes.
// ABOUTME: Ensures the CLI can summarize repo, aggregation, target, and skill state consistently.

import { afterEach, describe, expect, test } from "bun:test";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("agents status", () => {
  test("reports repo root, agents dir, and counts", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["status"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(fixture.repoRoot);
    expect(result.stdout).toContain(fixture.agentsDir);
    expect(result.stdout).toContain("curatedSkillCount");
  });

  test("supports --json output", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["status", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { repoRoot: string; curatedSkillCount: number };
    expect(parsed.repoRoot).toBe(fixture.repoRoot);
    expect(parsed.curatedSkillCount).toBe(1);
  });
});
