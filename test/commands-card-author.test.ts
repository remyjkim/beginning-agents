// ABOUTME: Verifies card source authoring and local publishing commands.
// ABOUTME: Protects the immutable local store contract for Harness Cards.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

test("card new creates a source with card.json and persists scope", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["card", "new", "backend", "--scope", "@me", "--no-git"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(existsSync(join(fixture.agentsDir, "bgng", "sources", "@me", "backend", "card.json"))).toBe(true);
  const machine = JSON.parse(await readFile(join(fixture.agentsDir, "bgng", "machine.json"), "utf8"));
  expect(machine.authoring.scope).toBe("@me");
});

test("card new fails for unscoped non-interactive names without authoring scope", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["card", "new", "backend", "--no-git"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("scope");
});

test("card publish creates immutable version and card show displays it", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const manifestPath = join(fixture.agentsDir, "bgng", "sources", "@me", "backend", "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.skills = { include: ["alpha"] };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const published = await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture));
  expect(published.exitCode).toBe(0);
  expect(existsSync(join(fixture.agentsDir, "bgng", "cards", "@me", "backend", "1.0.0", "card.json"))).toBe(true);

  const show = await runAgentsCli(["card", "show", "@me/backend@1.0.0"], envFor(fixture));
  expect(show.exitCode).toBe(0);
  expect(show.stdout).toContain("@me/backend");
});

test("card publish refuses to overwrite an existing version", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture))).exitCode).toBe(0);

  const second = await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture));

  expect(second.exitCode).not.toBe(0);
  expect(second.stderr).toContain("already exists");
});

test("card publish rejects package contract mismatch", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  await writeFile(
    join(fixture.agentsDir, "bgng", "sources", "@me", "backend", "package.json"),
    JSON.stringify({ name: "@me/wrong", version: "1.0.0" }, null, 2),
  );

  const result = await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("package.json.name");
});

test("card diff classifies structural changes", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture))).exitCode).toBe(0);
  const manifestPath = join(fixture.agentsDir, "bgng", "sources", "@me", "backend", "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "1.1.0";
  manifest.skills = { include: ["alpha"] };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture))).exitCode).toBe(0);

  const diff = await runAgentsCli(["card", "diff", "@me/backend@1.0.0", "@me/backend@1.1.0"], envFor(fixture));

  expect(diff.exitCode).toBe(0);
  expect(diff.stdout).toContain("Classification: minor");
});
