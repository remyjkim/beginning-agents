// ABOUTME: Verifies the shared filesystem helpers used by sync, skills, and diagnostics core modules.
// ABOUTME: Locks in safe lstat/realpath/parent-dir behavior before deduplicating helper implementations.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-fs-"));
  tempRoots.push(root);
  return root;
}

describe("lstatSafe", () => {
  test("returns stats for existing path", async () => {
    const { lstatSafe } = await import("../cli/core/fs");
    const root = await createTempRoot();
    const file = join(root, "test.txt");
    await writeFile(file, "hello");

    expect(lstatSafe(file)).not.toBeNull();
  });

  test("returns null for missing path", async () => {
    const { lstatSafe } = await import("../cli/core/fs");

    expect(lstatSafe("/nonexistent/path")).toBeNull();
  });
});

describe("realpathSafe", () => {
  test("resolves symlinks", async () => {
    const { realpathSafe } = await import("../cli/core/fs");
    const root = await createTempRoot();
    const target = join(root, "target");
    const link = join(root, "link");
    await mkdir(target);
    await symlink(target, link, "dir");

    expect(realpathSafe(link)).toBe(realpathSync(target));
  });

  test("returns resolve() for broken path", async () => {
    const { realpathSafe } = await import("../cli/core/fs");
    const result = realpathSafe("/does/not/exist");

    expect(typeof result).toBe("string");
  });
});

describe("ensureParentDir", () => {
  test("creates parent directories", async () => {
    const { ensureParentDir } = await import("../cli/core/fs");
    const root = await createTempRoot();
    const deep = join(root, "a", "b", "c", "file.txt");

    ensureParentDir(deep, false);

    expect(existsSync(join(root, "a", "b", "c"))).toBe(true);
  });

  test("skips creation in dry-run mode", async () => {
    const { ensureParentDir } = await import("../cli/core/fs");
    const root = await createTempRoot();
    const deep = join(root, "x", "y", "file.txt");

    ensureParentDir(deep, true);

    expect(existsSync(join(root, "x"))).toBe(false);
  });
});
