// ABOUTME: Implements the target `bgng apply` command over the sync engine.
// ABOUTME: Provides clearer one-way materialization vocabulary while keeping sync compatible.

import { Option, UsageError } from "clipanion";
import { renderJson, renderSyncResult } from "../core/output";
import { syncRepository } from "../core/sync";
import { BaseCommand } from "./base";

export class ApplyCommand extends BaseCommand {
  static override paths = [["apply"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Apply effective bgng config to downstream tools.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  mcpOnly = Option.Boolean("--mcp-only", false, {
    description: "Apply only MCP configuration.",
  });

  skillsOnly = Option.Boolean("--skills-only", false, {
    description: "Apply only skills.",
  });

  target = Option.String("--target", {
    description: "Limit apply to one target.",
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
