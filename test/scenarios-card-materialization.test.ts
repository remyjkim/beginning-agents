// ABOUTME: Verifies cards contribute effective skills and MCP servers during project writes.
// ABOUTME: Protects the end-to-end card consumption path beyond lockfile mutation.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

test("project write materializes skills and servers introduced by cards", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const manifestPath = join(fixture.agentsDir, "bgng", "sources", "@me", "backend", "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.skills = { include: ["alpha"] };
  manifest.servers = {
    "card-server": {
      description: "From card",
      transport: "stdio",
      command: "card-run",
      optional: false,
    },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture))).exitCode).toBe(0);

  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "bgng", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/backend@^1.0.0"] }, null, 2));

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(true);
  const settings = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8"));
  expect(settings.mcpServers["card-server"].command).toBe("card-run");
});
