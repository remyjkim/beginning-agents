// ABOUTME: Verifies the target `bgng apply` command surface over the existing sync engine.
// ABOUTME: Protects the clearer materialization vocabulary while preserving sync compatibility.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("bgng apply", () => {
  test("dry-run reports changes like sync", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    const apply = await runAgentsCli(["apply", "--dry-run"], env);
    const sync = await runAgentsCli(["sync", "--dry-run"], env);

    expect(apply.exitCode).toBe(0);
    expect(sync.exitCode).toBe(0);
    expect(apply.stdout).toContain("Changes:");
    expect(sync.stdout).toContain("Changes:");
  });

  test("supports json, target, and mode flags", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    const json = await runAgentsCli(["apply", "--dry-run", "--json"], env);
    expect(json.exitCode).toBe(0);
    expect(() => JSON.parse(json.stdout)).not.toThrow();

    const target = await runAgentsCli(["apply", "--dry-run", "--target=claude"], env);
    expect(target.exitCode).toBe(0);
    expect(target.stdout).toContain("settings.json");
    expect(target.stdout).not.toContain("config.toml");

    const mcpOnly = await runAgentsCli(["apply", "--dry-run", "--mcp-only"], env);
    expect(mcpOnly.exitCode).toBe(0);
    expect(mcpOnly.stdout).not.toContain(".claude/skills");
  });

  test("rejects mutually exclusive mode flags", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["apply", "--mcp-only", "--skills-only"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Use either --mcp-only or --skills-only");
  });

  test("global default skills sync without curated symlinks", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
    const repoConfig = JSON.parse(await readFile(join(fixture.repoRoot, "config.json"), "utf8"));
    repoConfig.defaults = { skills: ["alpha"], mcpServers: ["context7"] };
    await writeFile(join(fixture.agentsDir, "bgng", "config.json"), JSON.stringify(repoConfig, null, 2));

    const result = await runAgentsCli(["apply", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(".claude/skills/alpha");
    expect(result.stdout).toContain(".codex/skills/alpha");
    expect(existsSync(join(fixture.agentsDir, "skills", "alpha"))).toBe(false);
  });

  test("project excludes remove global default skills", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
    const repoConfig = JSON.parse(await readFile(join(fixture.repoRoot, "config.json"), "utf8"));
    repoConfig.defaults = { skills: ["alpha"], mcpServers: ["context7"] };
    await writeFile(join(fixture.agentsDir, "bgng", "config.json"), JSON.stringify(repoConfig, null, 2));
    const projectDir = join(fixture.root, "project");
    await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
    await writeFile(
      join(projectDir, ".agents", "bgng", "config.json"),
      JSON.stringify({ version: 1, skills: { exclude: ["alpha"] } }, null, 2),
    );

    const result = await runAgentsCli(["apply", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(".claude/skills/alpha");
    expect(result.stdout).not.toContain(".codex/skills/alpha");
  });

  test("project server disable overrides explicit global MCP defaults", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
    const repoConfig = JSON.parse(await readFile(join(fixture.repoRoot, "config.json"), "utf8"));
    repoConfig.defaults = { mcpServers: ["context7"] };
    await writeFile(join(fixture.agentsDir, "bgng", "config.json"), JSON.stringify(repoConfig, null, 2));
    const projectDir = join(fixture.root, "project");
    await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
    await writeFile(
      join(projectDir, ".agents", "bgng", "config.json"),
      JSON.stringify({ version: 1, servers: { context7: { enabled: false } } }, null, 2),
    );

    const result = await runAgentsCli(["apply", "--dry-run", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("@upstash/context7-mcp");
  });

  test("global default user library MCP servers render during apply", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { saveMcpLibrary } = await import("../cli/core/mcp-library");
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
    await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
    const repoConfig = JSON.parse(await readFile(join(fixture.repoRoot, "config.json"), "utf8"));
    repoConfig.defaults = { mcpServers: ["github"] };
    await writeFile(join(fixture.agentsDir, "bgng", "config.json"), JSON.stringify(repoConfig, null, 2));

    const result = await runAgentsCli(["apply", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("settings.json");
  });

  test("project-enabled user library MCP servers render during apply", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { saveMcpLibrary } = await import("../cli/core/mcp-library");
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
    const projectDir = join(fixture.root, "project");
    await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
    await writeFile(
      join(projectDir, ".agents", "bgng", "config.json"),
      JSON.stringify({ version: 1, servers: { github: { enabled: true } } }, null, 2),
    );

    const result = await runAgentsCli(["apply"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    const settings = JSON.parse(await readFile(fixture.claudeSettings, "utf8")) as { mcpServers?: Record<string, { command?: string }> };
    expect(settings.mcpServers?.github?.command).toBe("npx");
  });
});
