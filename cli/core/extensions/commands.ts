// ABOUTME: Provides small helpers for checking and invoking external extension CLIs.
// ABOUTME: Keeps Beads and Parallel command execution testable through fake PATH fixtures.

import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

export interface CommandCheck {
  command: string;
  available: boolean;
  path?: string;
}

type EnvShape = Record<string, string | undefined>;

export async function findCommand(command: string, env: EnvShape = process.env): Promise<CommandCheck> {
  const pathValue = env.PATH ?? "";
  for (const dir of pathValue.split(":").filter(Boolean)) {
    const candidate = join(dir, command);
    try {
      await access(candidate, constants.X_OK);
      return { command, available: true, path: candidate };
    } catch {
      // Keep scanning PATH.
    }
  }
  return { command, available: false };
}

export async function runExternalCommand(options: {
  cmd: string[];
  cwd: string;
  env?: EnvShape;
}) {
  const proc = Bun.spawn(options.cmd, {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...options.env,
    },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}
