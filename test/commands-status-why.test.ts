// ABOUTME: Verifies `bgng status --why` and `--explain` provenance output.
// ABOUTME: Protects the cards-era diagnostics command surface.

import { afterEach, expect, test } from "bun:test";
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

async function publishDiagnosticCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
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
}

test("status --why answers typed and unique bare queries", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishDiagnosticCard(fixture);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "bgng", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/backend@^1.0.0"] }, null, 2));
  expect((await runAgentsCli(["card", "update"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const skill = await runAgentsCli(["status", "--why", "skill:alpha"], envFor(fixture), projectDir);
  const server = await runAgentsCli(["status", "--why", "card-server"], envFor(fixture), projectDir);

  expect(skill.exitCode).toBe(0);
  expect(skill.stdout).toContain("card @me/backend@1.0.0");
  expect(server.exitCode).toBe(0);
  expect(server.stdout).toContain("server:card-server");
});

test("status --why bare query fails when ambiguous and --explain includes provenance", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "bgng", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify({ version: 1, skills: { include: ["alpha"] }, servers: { alpha: { enabled: true } } }, null, 2),
  );

  const ambiguous = await runAgentsCli(["status", "--why", "alpha"], envFor(fixture), projectDir);
  const explain = await runAgentsCli(["status", "--explain"], envFor(fixture), projectDir);

  expect(ambiguous.exitCode).not.toBe(0);
  expect(ambiguous.stderr).toContain("ambiguous");
  expect(explain.exitCode).toBe(0);
  expect(explain.stdout).toContain("Skills");
  expect(explain.stdout).toContain("Targets");
});
