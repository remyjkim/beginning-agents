// ABOUTME: Verifies Harness Card lockfile read/write helpers.
// ABOUTME: Protects project card resolution persistence.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cardLockPath, loadCardLock, writeCardLock } from "../cli/core/card-lock";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("writeCardLock creates a project lockfile and loadCardLock reads it", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  const path = writeCardLock(root, [
    {
      name: "@me/backend",
      requested: "@me/backend@^1.0.0",
      version: "1.0.0",
      path: "/cards/@me/backend/1.0.0",
      integrity: "sha256-test",
      manifest: { name: "@me/backend", version: "1.0.0" },
    },
  ]);

  expect(path).toBe(cardLockPath(root));
  expect(existsSync(path)).toBe(true);
  expect((await loadCardLock(root))?.cards[0]?.name).toBe("@me/backend");
});

test("loadCardLock returns null when no lockfile exists", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  expect(await loadCardLock(root)).toBeNull();
});
