// ABOUTME: Verifies Beads extension planning without invoking the real bd executable.
// ABOUTME: Protects setup from accidental destructive commands.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createTempRoot } from "./helpers";
import { planBeadsSetup, normalizeBeadsTargets } from "../cli/core/extensions/beads";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("beads extension setup planner", () => {
  test("fresh project plans init and target setup commands", async () => {
    const projectDir = await createTempRoot("agents-beads-plan-");
    tempRoots.push(projectDir);

    const plan = await planBeadsSetup({ projectDir, targets: ["codex", "claude"] });

    expect(plan.beadsDirExists).toBe(false);
    expect(plan.commands.map((command) => command.cmd.join(" "))).toEqual([
      "bd init --quiet --non-interactive",
      "bd setup codex --check",
      "bd setup codex",
      "bd setup claude --check",
      "bd setup claude",
    ]);
    expect(plan.commands.some((command) => command.cmd.includes("--force"))).toBe(false);
    expect(plan.commands.some((command) => command.cmd.includes("--fix"))).toBe(false);
  });

  test("existing beads project skips init", async () => {
    const projectDir = await createTempRoot("agents-beads-plan-");
    tempRoots.push(projectDir);
    await mkdir(join(projectDir, ".beads"), { recursive: true });

    const plan = await planBeadsSetup({ projectDir, targets: ["cursor"] });

    expect(plan.beadsDirExists).toBe(true);
    expect(plan.commands.map((command) => command.cmd.join(" "))).toEqual([
      "bd setup cursor --check",
      "bd setup cursor",
    ]);
  });

  test("respects skip flags and stealth mode", async () => {
    const projectDir = await createTempRoot("agents-beads-plan-");
    tempRoots.push(projectDir);

    const plan = await planBeadsSetup({
      projectDir,
      targets: ["codex"],
      stealth: true,
      skipBdSetup: true,
    });

    expect(plan.commands.map((command) => command.cmd.join(" "))).toEqual([
      "bd init --quiet --non-interactive --stealth",
    ]);
  });

  test("normalizes target selections", () => {
    expect(normalizeBeadsTargets(undefined)).toEqual(["codex", "claude", "cursor"]);
    expect(normalizeBeadsTargets("codex,claude")).toEqual(["codex", "claude"]);
    expect(() => normalizeBeadsTargets("bogus")).toThrow("Unsupported Beads target");
  });
});
