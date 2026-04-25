// ABOUTME: Validates the shared path resolution helpers used by the CLI and sync wrapper.
// ABOUTME: Keeps low-level path semantics stable while higher-level modules are refactored.

import { describe, expect, test } from "bun:test";

describe("path resolution", () => {
  test("expandHomePath replaces leading ~", async () => {
    const { expandHomePath } = await import("../cli/core/paths");

    expect(expandHomePath("~/foo/bar", "/home/test")).toBe("/home/test/foo/bar");
    expect(expandHomePath("~", "/home/test")).toBe("/home/test");
    expect(expandHomePath("/absolute/path", "/home/test")).toBe("/absolute/path");
  });

  test("resolveAgentsDir defaults to homeDir/.agents", async () => {
    const { resolveAgentsDir } = await import("../cli/core/paths");

    expect(resolveAgentsDir("/home/test")).toBe("/home/test/.agents");
  });

  test("resolveToolPaths returns expected tool directories", async () => {
    const { resolveToolPaths } = await import("../cli/core/paths");
    const paths = resolveToolPaths("/home/test");

    expect(paths.claudeSkills).toBe("/home/test/.claude/skills");
    expect(paths.codexSkills).toBe("/home/test/.codex/skills");
    expect(paths.claudeSettings).toBe("/home/test/.claude/settings.json");
  });

  test("resolveSkillScopeDirs returns all four scope directories", async () => {
    const { resolveSkillScopeDirs } = await import("../cli/core/paths");
    const dirs = resolveSkillScopeDirs("/repo");

    expect(dirs.shared).toBe("/repo/skills/shared");
    expect(dirs.claudeOnly).toBe("/repo/skills/claude-only");
    expect(dirs.codexOnly).toBe("/repo/skills/codex-only");
    expect(dirs.experimental).toBe("/repo/skills/experimental");
  });
});
