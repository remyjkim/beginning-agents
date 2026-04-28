// ABOUTME: Implements project-first extension activation through `bgng add extension`.
// ABOUTME: Writes semantic project config without running external setup commands.

import { Option, UsageError } from "clipanion";
import { normalizeBeadsTargets } from "../../core/extensions/beads";
import { getExtension } from "../../core/extensions/registry";
import { buildParallelProjectConfig } from "../../core/extensions/parallel";
import { projectConfigPath, setProjectExtensionConfig } from "../../core/project-writes";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class AddExtensionCommand extends BaseCommand {
  static override paths = [["add", "extension"]];

  static override usage = BaseCommand.Usage({
    category: "Add",
    description: "Add an extension to the current project.",
  });

  extensionName = Option.String({ required: true });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview project config changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  mcp = Option.Boolean("--mcp", false, {
    description: "Enable extension MCP mode when supported.",
  });

  skipSkills = Option.Boolean("--skip-skills", false, {
    description: "Do not enable extension skills when supported.",
  });

  target = Option.String("--target", {
    description: "Comma-separated Beads setup targets.",
  });

  includeSkill = Option.Boolean("--include-skill", false, {
    description: "Include the extension's project skill when supported.",
  });

  async execute() {
    const extension = getExtension(this.extensionName);
    if (!extension) {
      throw new UsageError(`Unknown extension: ${this.extensionName}`);
    }

    const projectDir = this.context.cwd;
    const configPath = projectConfigPath(projectDir);
    let extensionConfig;
    const next: string[] = ["bgng apply --dry-run"];

    if (this.extensionName === "parallel") {
      extensionConfig = buildParallelProjectConfig({ skills: !this.skipSkills, mcp: this.mcp });
    } else if (this.extensionName === "beads") {
      let targets;
      try {
        targets = normalizeBeadsTargets(this.target);
      } catch (error) {
        throw new UsageError(error instanceof Error ? error.message : "Invalid Beads setup target.");
      }
      extensionConfig = { enabled: true, targets, includeSkill: this.includeSkill };
      next.unshift(`bgng extensions setup beads --target=${targets.join(",")}`);
    } else {
      throw new UsageError(`Adding this extension is not implemented yet: ${this.extensionName}`);
    }

    const payload = {
      kind: "extension",
      id: this.extensionName,
      projectConfigPath: configPath,
      projectChanges: [{ kind: "extension", id: this.extensionName, action: "enabled" }],
      next,
    };

    if (!this.dryRun) {
      setProjectExtensionConfig(projectDir, this.extensionName, extensionConfig);
    }

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }

    this.context.stdout.write(
      [
        `Added ${extension.displayName} extension to this project.`,
        ...(this.dryRun ? [`Would update ${configPath}`] : [`Updated ${configPath}`]),
        "",
        "Next:",
        ...next.map((command) => `  ${command}`),
      ].join("\n") + "\n",
    );
    return 0;
  }
}
