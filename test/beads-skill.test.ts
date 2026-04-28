// ABOUTME: Verifies the repo-native Beads skill contains the command guidance needed by agents.
// ABOUTME: Keeps the Beads extension skill concise and non-interactive.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("beads task tracking skill", () => {
  test("documents the core non-interactive bd workflow", async () => {
    const content = await readFile(new URL("../skills/shared/beads-task-tracking/SKILL.md", import.meta.url), "utf8");

    expect(content).toContain("bd ready --json");
    expect(content).toContain("bd create");
    expect(content).toContain("bd update");
    expect(content).toContain("--claim");
    expect(content).toContain("bd close");
    expect(content).toContain("bd prime");
    expect(content).toContain("bd edit");
    expect(content).toContain("bd doctor --fix");
  });
});
