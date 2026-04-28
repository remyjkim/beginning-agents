// ABOUTME: Verifies reusable extension command helpers without depending on real machine tools.
// ABOUTME: Uses fake executables so extension checks remain deterministic.

import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createTempRoot } from "./helpers";
import { findCommand, runExternalCommand } from "../cli/core/extensions/commands";

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

describe("extension command helpers", () => {
  test("findCommand detects a fake executable on PATH", async () => {
    const root = await createTempRoot("agents-ext-command-");
    tempRoots.push(root);
    const binDir = join(root, "bin");
    await mkdir(binDir, { recursive: true });
    const path = await createExecutable(binDir, "bd", "echo bd");

    const result = await findCommand("bd", { PATH: binDir });

    expect(result).toEqual({ command: "bd", available: true, path });
  });

  test("findCommand reports missing executables", async () => {
    const root = await createTempRoot("agents-ext-command-");
    tempRoots.push(root);

    const result = await findCommand("bd", { PATH: root });

    expect(result).toEqual({ command: "bd", available: false });
  });

  test("runExternalCommand captures stdout stderr and exit code", async () => {
    const root = await createTempRoot("agents-ext-command-");
    tempRoots.push(root);
    const binDir = join(root, "bin");
    await mkdir(binDir, { recursive: true });
    await createExecutable(binDir, "sample", "echo out; echo err >&2; exit 7");

    const result = await runExternalCommand({
      cmd: ["sample"],
      cwd: root,
      env: { PATH: binDir },
    });

    expect(result).toEqual({ exitCode: 7, stdout: "out\n", stderr: "err\n" });
  });
});
