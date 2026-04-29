// ABOUTME: Implements the primary `bgng write` command over the materialization engine.
// ABOUTME: Provides the one-way operator vocabulary for writing effective state downstream.

import { Option, UsageError } from "clipanion";
import { renderJson, renderSyncResult } from "../core/output";
import { syncRepository } from "../core/sync";
import { BaseCommand } from "./base";

export class WriteCommand extends BaseCommand {
  static override paths = [["write"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Write effective bgng config to downstream local agent tools.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview writes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  mcpOnly = Option.Boolean("--mcp-only", false, {
    description: "Write only MCP configuration.",
  });

  skillsOnly = Option.Boolean("--skills-only", false, {
    description: "Write only skills.",
  });

  target = Option.String("--target", {
    description: "Limit write to one target.",
  });

  async execute() {
    if (this.mcpOnly && this.skillsOnly) {
      throw new UsageError("Use either --mcp-only or --skills-only, not both.");
    }
    if (this.target && this.target !== "claude" && this.target !== "codex" && this.target !== "cursor") {
      throw new UsageError(`Unsupported target: ${this.target}`);
    }

    const result = await syncRepository({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      cwd: this.context.cwd,
      dryRun: this.dryRun,
      mcpOnly: this.mcpOnly,
      skillsOnly: this.skillsOnly,
      target: this.target as "claude" | "codex" | "cursor" | undefined,
    });

    this.context.stdout.write(this.json ? renderJson(result) : renderSyncResult(result));
    return 0;
  }
}
