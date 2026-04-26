// ABOUTME: Verifies the public `agents status` command in human and JSON modes.
// ABOUTME: Ensures the CLI can summarize repo, aggregation, target, and skill state consistently.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

  test("shows project section when project config exists", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "bgng", "config.json");
    await mkdir(dirname(projectConfigPath), { recursive: true });
    await writeFile(projectConfigPath, JSON.stringify({ version: 1, skills: { include: ["beta"], exclude: ["alpha"] } }, null, 2));

    const result = await runAgentsCli(["status"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Project");
    expect(result.stdout).toContain(projectConfigPath);
  });

  test("json output includes project info when config exists", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "bgng", "config.json");
    await mkdir(dirname(projectConfigPath), { recursive: true });
    await writeFile(projectConfigPath, JSON.stringify({ version: 1, targets: { codex: { enabled: false } } }, null, 2));

    const result = await runAgentsCli(["status", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    const parsed = JSON.parse(result.stdout) as { project?: { configPath: string } };
    expect(result.exitCode).toBe(0);
    expect(await realpath(parsed.project?.configPath ?? projectConfigPath)).toBe(await realpath(projectConfigPath));
  });
});
