// ABOUTME: Verifies the public `agents skills list` command in human and JSON modes.
// ABOUTME: Ensures Clipanion command registration and skill inventory output are correct.

import { afterEach, describe, expect, test } from "bun:test";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("agents skills list", () => {
  test("lists repo skills with scope and curated state", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["skills", "list"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("alpha");
    expect(result.stdout).toContain("shared");
    expect(result.stdout).toContain("curated");
  });

  test("supports --json output", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["skills", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ name: string; scope: string; curated: boolean }>;
    expect(parsed.some((skill) => skill.name === "alpha" && skill.scope === "shared" && skill.curated)).toBe(true);
  });
});
