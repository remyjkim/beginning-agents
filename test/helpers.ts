// ABOUTME: Provides reusable temp-repo and temp-home fixtures for CLI and core integration tests.
// ABOUTME: Centralizes CLI spawning with environment overrides so tests never touch the real machine state.

import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CanonicalConfig, CanonicalRegistry } from "../cli/core/types";

export async function createTempRoot(prefix: string) {
  return await mkdtemp(join(tmpdir(), prefix));
}

export async function cleanupTempRoots(roots: string[]) {
  await Promise.all(
    roots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
}

export function createFixtureRegistry(): CanonicalRegistry {
  return {
    version: 1,
    servers: {
      context7: {
        description: "Docs",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        optional: false,
      },
      "parallel-search": {
        description: "Parallel Search MCP",
        transport: "http",
        url: "https://search.parallel.ai/mcp",
        optional: false,
      },
    },
  };
}

export function createFixtureConfig(
  paths: { claudeSettings: string; codexConfig: string; cursorConfig: string },
  parallelMcpEnabled = false,
): CanonicalConfig {
  return {
    version: 1,
    targets: {
      claude: { enabled: true, configPath: paths.claudeSettings, format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: true, configPath: paths.codexConfig, format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: true, configPath: paths.cursorConfig, format: "json-standalone", mcpKey: "mcpServers", symlink: true },
    },
    optional: {},
    parallel: { cli: { enabled: true }, mcp: { enabled: parallelMcpEnabled } },
  };
}

export async function scaffoldCliFixture(options?: { parallelMcpEnabled?: boolean; curatedSkillNames?: string[] }) {
  const root = await createTempRoot("agents-cli-");
  const repoRoot = join(root, "repo");
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");
  const claudeSettings = join(homeDir, ".claude", "settings.json");
  const codexConfig = join(homeDir, ".codex", "config.toml");
  const cursorConfig = join(homeDir, ".cursor", "mcp.json");

  await mkdir(join(repoRoot, "skills", "shared"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "claude-only"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "codex-only"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "experimental"), { recursive: true });
  await mkdir(dirname(claudeSettings), { recursive: true });
  await mkdir(dirname(codexConfig), { recursive: true });
  await mkdir(dirname(cursorConfig), { recursive: true });
  await mkdir(join(agentsDir, "skills"), { recursive: true });

  await writeFile(join(repoRoot, "mcp-servers.json"), JSON.stringify(createFixtureRegistry(), null, 2));
  await writeFile(
    join(repoRoot, "config.json"),
    JSON.stringify(
      createFixtureConfig({ claudeSettings, codexConfig, cursorConfig }, options?.parallelMcpEnabled ?? false),
      null,
      2,
    ),
  );
  await writeFile(claudeSettings, JSON.stringify({ model: "sonnet" }, null, 2));
  await writeFile(codexConfig, 'personality = "pragmatic"\n');
  await writeFile(cursorConfig, JSON.stringify({ mcpServers: {} }, null, 2));

  for (const name of ["alpha", "beta"]) {
    const skillDir = join(repoRoot, "skills", "shared", name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\n---\n`);
  }

  for (const name of options?.curatedSkillNames ?? []) {
    await symlink(join(repoRoot, "skills", "shared", name), join(agentsDir, "skills", name), "dir");
  }

  return { root, repoRoot, homeDir, agentsDir, claudeSettings, codexConfig, cursorConfig };
}

export async function runAgentsCli(args: string[], env: Record<string, string>) {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", ...args], {
    cwd: join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
    },
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

export async function runGlobalAgentsCli(args: string[], env: Record<string, string>) {
  const proc = Bun.spawn(["bgng", ...args], {
    cwd: join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
    },
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

export async function runSyncWrapper(args: string[], env: Record<string, string>) {
  const proc = Bun.spawn(["bun", "run", "sync-mcp.ts", ...args], {
    cwd: join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
    },
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}
