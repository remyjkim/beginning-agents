// ABOUTME: Verifies pure interactive mode resolution for commands that can prompt.
// ABOUTME: Keeps non-TTY safety semantics independent from Clipanion command tests.

import { describe, expect, test } from "bun:test";

describe("core interactivity", () => {
  test("defaults init to guided mode only when both stdin and stdout are TTYs", async () => {
    const { resolveInitMode } = await import("../cli/core/interactivity");

    expect(resolveInitMode({ guided: false, minimal: false, nonInteractive: false, stdinIsTTY: true, stdoutIsTTY: true }).mode).toBe("guided");
    expect(resolveInitMode({ guided: false, minimal: false, nonInteractive: false, stdinIsTTY: false, stdoutIsTTY: true }).mode).toBe("error");
  });

  test("uses minimal mode for explicit non-interactive flags", async () => {
    const { resolveInitMode } = await import("../cli/core/interactivity");

    expect(resolveInitMode({ guided: false, minimal: true, nonInteractive: false, stdinIsTTY: false, stdoutIsTTY: false }).mode).toBe("minimal");
    expect(resolveInitMode({ guided: false, minimal: false, nonInteractive: true, stdinIsTTY: false, stdoutIsTTY: false }).mode).toBe("minimal");
  });

  test("rejects guided mode without a TTY", async () => {
    const { resolveInitMode } = await import("../cli/core/interactivity");

    const result = resolveInitMode({ guided: true, minimal: false, nonInteractive: false, stdinIsTTY: false, stdoutIsTTY: false });
    expect(result.mode).toBe("error");
    expect(result.message).toContain("TTY");
  });
});
