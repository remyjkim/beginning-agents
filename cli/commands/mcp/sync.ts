// ABOUTME: Implements the `bgng mcp sync` command using the extracted MCP sync core.
// ABOUTME: Preserves the current target selection and dry-run behavior while exposing it through Clipanion.

import { Option, UsageError } from "clipanion";
import { loadConfig } from "../../../cli/core/config";
import { mergeUserMcpLibrary } from "../../../cli/core/defaults";
import { buildActiveServers } from "../../../cli/core/mcp";
import { loadMcpLibrary } from "../../../cli/core/mcp-library";
import { renderJson, renderSyncResult } from "../../../cli/core/output";
import { normalizeSyncPathOptions } from "../../../cli/core/paths";
import { loadProjectConfig, mergeProjectConfig } from "../../../cli/core/project";
import { loadRegistry } from "../../../cli/core/registry";
import { syncMcp } from "../../../cli/core/sync";
import { loadEffectiveConfig } from "../../../cli/core/user-config";
import { BaseCommand } from "../base";

export class McpSyncCommand extends BaseCommand {
  static override paths = [["mcp", "sync"]];

  static override usage = BaseCommand.Usage({
    category: "MCP",
    description: "Sync active harness MCP servers into enabled targets.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  target = Option.String("--target", {
    description: "Sync only one target.",
  });

  async execute() {
    if (this.target && this.target !== "claude" && this.target !== "codex" && this.target !== "cursor") {
      throw new UsageError(`Unsupported target: ${this.target}`);
    }

    const [repoConfig, builtInRegistry, userMcpLibrary] = await Promise.all([
      loadConfig(this.context.repoRoot),
      loadRegistry(this.context.repoRoot),
      loadMcpLibrary(this.context.agentsDir),
    ]);
    const registry = mergeUserMcpLibrary(builtInRegistry, userMcpLibrary);
    const { config } = await loadEffectiveConfig(repoConfig, this.context.agentsDir);
    let effectiveConfig = config;
    let effectiveRegistry = registry;
    if (this.context.projectConfigPath) {
      const merged = mergeProjectConfig(config, registry, await loadProjectConfig(this.context.projectConfigPath));
      effectiveConfig = merged.config;
      effectiveRegistry = merged.registry;
    }

    const result = await syncMcp(
      normalizeSyncPathOptions(
        {
          repoRoot: this.context.repoRoot,
          agentsDir: this.context.agentsDir,
          homeDir: this.context.homeDir,
          cwd: this.context.cwd,
          dryRun: this.dryRun,
          target: this.target as "claude" | "codex" | "cursor" | undefined,
        },
        import.meta.path,
      ),
      effectiveConfig,
      buildActiveServers(effectiveRegistry, effectiveConfig),
    );

    this.context.stdout.write(this.json ? renderJson(result) : renderSyncResult(result));
    return 0;
  }
}
