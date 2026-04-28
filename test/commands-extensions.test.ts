// ABOUTME: Verifies bgng extensions command behavior for Beads and Parallel.
// ABOUTME: Uses fake external CLIs so extension workflows are deterministic and non-mutating unless tested.

import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function createExecutable(dir: string, name: string, body: string) {
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

async function addBeadsSkill(repoRoot: string) {
  const skillDir = join(repoRoot, "skills", "shared", "beads-task-tracking");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    "---\nname: beads-task-tracking\ndescription: Use Beads issue tracking\n---\n",
  );
}

async function addParallelSkills(repoRoot: string) {
  for (const name of ["parallel-web-search", "parallel-web-extract", "parallel-deep-research", "parallel-data-enrichment"]) {
    const skillDir = join(repoRoot, "skills", "shared", name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\n---\n`);
  }
}

function cliEnv(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, extra?: Record<string, string>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
    ...extra,
  };
}

describe("bgng extensions", () => {
  test("list and show expose built-in extension definitions", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await addBeadsSkill(fixture.repoRoot);

    const list = await runAgentsCli(["extensions", "list", "--json"], cliEnv(fixture));
    const show = await runAgentsCli(["extensions", "show", "beads", "--json"], cliEnv(fixture));

    expect(list.exitCode).toBe(0);
    expect(show.exitCode).toBe(0);
    const listParsed = JSON.parse(list.stdout) as Array<{ id: string }>;
    const showParsed = JSON.parse(show.stdout) as { id: string; scopes: string[] };
    expect(listParsed.map((extension) => extension.id)).toEqual(["beads", "parallel"]);
    expect(showParsed.id).toBe("beads");
    expect(showParsed.scopes).toContain("project");
  });

  test("status reports missing beads command and absent project state", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await addBeadsSkill(fixture.repoRoot);

    const result = await runAgentsCli(["extensions", "status", "beads", "--json"], cliEnv(fixture, { PATH: fixture.root }), fixture.root);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { id: string; commands: Array<{ name: string; available: boolean }>; project?: { beadsDirExists?: boolean } };
    expect(parsed.id).toBe("beads");
    expect(parsed.commands.find((command) => command.name === "bd")?.available).toBe(false);
    expect(parsed.project?.beadsDirExists).toBe(false);
  });

  test("status reports parallel CLI and MCP mode compatibility", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);
    const binDir = join(fixture.root, "bin");
    await mkdir(binDir, { recursive: true });
    await createExecutable(binDir, "parallel-cli", "echo parallel");

    const result = await runAgentsCli(["extensions", "status", "parallel", "--json"], cliEnv(fixture, { PATH: binDir }));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { id: string; commands: Array<{ name: string; available: boolean }>; mcpServers: Array<{ name: string; active: boolean }> };
    expect(parsed.id).toBe("parallel");
    expect(parsed.commands.find((command) => command.name === "parallel-cli")?.available).toBe(true);
    expect(parsed.mcpServers.find((server) => server.name === "parallel-search")?.active).toBe(true);
  });

  test("status reports project-configured Parallel MCP activation", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: false });
    tempRoots.push(fixture.root);
    await addParallelSkills(fixture.repoRoot);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "bgng", "config.json");
    await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
    await writeFile(
      projectConfigPath,
      JSON.stringify({ version: 1, extensions: { parallel: { enabled: true, skills: true, mcp: true } } }, null, 2),
    );
    const binDir = join(fixture.root, "bin");
    await mkdir(binDir, { recursive: true });
    await createExecutable(binDir, "parallel-cli", "echo parallel");

    const result = await runAgentsCli(["extensions", "status", "parallel", "--json"], cliEnv(fixture, { PATH: binDir }), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      project?: { configPath?: string; extensionConfigured?: boolean; extensionEnabled?: boolean };
      mcpServers: Array<{ name: string; active: boolean }>;
    };
    expect(parsed.project?.configPath?.endsWith("/project/.agents/bgng/config.json")).toBe(true);
    expect(parsed.project?.extensionConfigured).toBe(true);
    expect(parsed.project?.extensionEnabled).toBe(true);
    expect(parsed.mcpServers.find((server) => server.name === "parallel-search")?.active).toBe(true);
  });

  test("doctor reports beads setup issues without mutating", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await addBeadsSkill(fixture.repoRoot);

    const result = await runAgentsCli(["extensions", "doctor", "beads", "--json"], cliEnv(fixture, { PATH: fixture.root }), fixture.root);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { issues: string[] };
    expect(parsed.issues.some((issue) => issue.includes("bd command is not available"))).toBe(true);
    expect(parsed.issues.some((issue) => issue.includes(".beads"))).toBe(true);
    expect(existsSync(join(fixture.root, ".beads"))).toBe(false);
  });

  test("doctor warns when beads doctor returns non-json output", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await addBeadsSkill(fixture.repoRoot);
    await mkdir(join(fixture.root, ".beads"));
    const binDir = join(fixture.root, "bin");
    await mkdir(binDir, { recursive: true });
    await createExecutable(binDir, "bd", 'if [ "$1" = "doctor" ]; then echo "plain text doctor output"; fi');

    const result = await runAgentsCli(["extensions", "doctor", "beads", "--json"], cliEnv(fixture, { PATH: binDir }), fixture.root);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { warnings: string[] };
    expect(parsed.warnings.some((warning) => warning.includes("non-JSON"))).toBe(true);
  });

  test("doctor reports missing Parallel MCP registry entries when MCP mode is enabled", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);
    const binDir = join(fixture.root, "bin");
    await mkdir(binDir, { recursive: true });
    await createExecutable(binDir, "parallel-cli", "echo parallel");

    const result = await runAgentsCli(["extensions", "doctor", "parallel", "--json"], cliEnv(fixture, { PATH: binDir }));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { issues: string[] };
    expect(parsed.issues).toContain("enabled Parallel MCP server is missing from registry: parallel-task");
  });

  test("setup beads dry-run prints planned commands without mutation", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await addBeadsSkill(fixture.repoRoot);
    const binDir = join(fixture.root, "bin");
    const logPath = join(fixture.root, "bd.log");
    await mkdir(binDir, { recursive: true });
    await createExecutable(binDir, "bd", `echo "$@" >> "${logPath}"`);

    const result = await runAgentsCli(["extensions", "setup", "beads", "--dry-run", "--target=codex"], cliEnv(fixture, { PATH: binDir }), fixture.root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("bd init --quiet --non-interactive");
    expect(result.stdout).toContain("bd setup codex");
    expect(existsSync(join(fixture.root, ".beads"))).toBe(false);
    expect(existsSync(logPath)).toBe(false);
  });

  test("setup beads reports unsupported targets as usage errors", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await addBeadsSkill(fixture.repoRoot);
    const binDir = join(fixture.root, "bin");
    await mkdir(binDir, { recursive: true });
    await createExecutable(binDir, "bd", "echo bd");

    const result = await runAgentsCli(["extensions", "setup", "beads", "--dry-run", "--target=unknown"], cliEnv(fixture, { PATH: binDir }), fixture.root);

    expect(result.exitCode).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toContain("Unsupported Beads target: unknown");
    expect(output).not.toContain("Internal Error");
  });

  test("setup beads executes planned commands and can include project skill", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await addBeadsSkill(fixture.repoRoot);
    const binDir = join(fixture.root, "bin");
    const logPath = join(fixture.root, "bd.log");
    await mkdir(binDir, { recursive: true });
    await createExecutable(
      binDir,
      "bd",
      [
        `echo "$@" >> "${logPath}"`,
        'if [ "$1" = "init" ]; then /bin/mkdir -p .beads; fi',
        "exit 0",
      ].join("\n"),
    );

    const result = await runAgentsCli(
      ["extensions", "setup", "beads", "--target=codex", "--include-skill"],
      cliEnv(fixture, { PATH: binDir }),
      fixture.root,
    );

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(fixture.root, ".beads"))).toBe(true);
    expect(await readFile(logPath, "utf8")).toContain("setup codex --check");
    const projectConfig = JSON.parse(await readFile(join(fixture.root, ".agents", "bgng", "config.json"), "utf8")) as {
      extensions?: { beads?: { enabled?: boolean; targets?: string[]; includeSkill?: boolean } };
      skills?: { include?: string[] };
    };
    expect(projectConfig.extensions?.beads).toEqual({ enabled: true, targets: ["codex"], includeSkill: true });
    expect(projectConfig.skills?.include ?? []).not.toContain("beads-task-tracking");
  });

  test("setup parallel writes semantic project extension config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["extensions", "setup", "parallel", "--mcp"], cliEnv(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const projectConfig = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "config.json"), "utf8")) as {
      extensions?: { parallel?: { enabled?: boolean; skills?: boolean; mcp?: boolean } };
      skills?: { include?: string[] };
    };
    expect(projectConfig.extensions?.parallel).toEqual({ enabled: true, skills: true, mcp: true });
    expect(projectConfig.skills?.include ?? []).not.toContain("parallel-web-search");
  });

  test("setup parallel dry-run previews config without writing", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["extensions", "setup", "parallel", "--dry-run", "--json", "--skip-skills"], cliEnv(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { projectConfigChange?: { extensionName?: string; config?: { skills?: boolean } } };
    expect(parsed.projectConfigChange?.extensionName).toBe("parallel");
    expect(parsed.projectConfigChange?.config?.skills).toBe(false);
    expect(existsSync(join(projectDir, ".agents", "bgng", "config.json"))).toBe(false);
  });
});
