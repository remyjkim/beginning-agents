// ABOUTME: Implements `bgng mcp apply` as the MCP-scoped alias for top-level apply.
// ABOUTME: Keeps advanced MCP users in the MCP namespace while sharing the sync engine.

import { Option, UsageError } from "clipanion";
import { renderJson, renderSyncResult } from "../../core/output";
import { syncRepository } from "../../core/sync";
import { BaseCommand } from "../base";

export class McpApplyCommand extends BaseCommand {
  static override paths = [["mcp", "apply"]];

  static override usage = BaseCommand.Usage({
    category: "MCP",
    description: "Apply effective MCP configuration into enabled targets.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  target = Option.String("--target", {
    description: "Apply only one target.",
  });

  async execute() {
    if (this.target && this.target !== "claude" && this.target !== "codex" && this.target !== "cursor") {
      throw new UsageError(`Unsupported target: ${this.target}`);
    }

    const result = await syncRepository({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      cwd: this.context.cwd,
      dryRun: this.dryRun,
      mcpOnly: true,
      target: this.target as "claude" | "codex" | "cursor" | undefined,
    });

    this.context.stdout.write(this.json ? renderJson(result) : renderSyncResult(result));
    return 0;
  }
}
