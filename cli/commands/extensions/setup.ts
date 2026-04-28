// ABOUTME: Implements bgng extensions setup for explicit extension setup flows.
// ABOUTME: Starts with Beads project setup while preserving dry-run and non-destructive defaults.

import { Option, UsageError } from "clipanion";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ensureBeadsProjectExtensionConfig, executeBeadsSetupPlan, normalizeBeadsTargets, planBeadsSetup } from "../../core/extensions/beads";
import { findCommand } from "../../core/extensions/commands";
import { ensureParallelProjectExtensionConfig, planParallelSetup } from "../../core/extensions/parallel";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class ExtensionsSetupCommand extends BaseCommand {
  static override paths = [["extensions", "setup"]];

  static override usage = BaseCommand.Usage({
    category: "Extensions",
    description: "Set up one extension.",
  });

  extensionName = Option.String({ required: true });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview setup without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  target = Option.String("--target", {
    description: "Comma-separated Beads setup targets.",
  });

  stealth = Option.Boolean("--stealth", false, {
    description: "Use Beads stealth setup mode where supported.",
  });

  skipBdInit = Option.Boolean("--skip-bd-init", false, {
    description: "Skip bd init even when .beads is absent.",
  });

  skipBdSetup = Option.Boolean("--skip-bd-setup", false, {
    description: "Skip bd setup target recipes.",
  });

  includeSkill = Option.Boolean("--include-skill", false, {
    description: "Include the beads-task-tracking skill in project config.",
  });

  mcp = Option.Boolean("--mcp", false, {
    description: "Enable extension MCP mode when supported.",
  });

  skipSkills = Option.Boolean("--skip-skills", false, {
    description: "Do not enable extension skills when supported.",
  });

  async execute() {
    if (this.extensionName === "parallel") {
      return this.executeParallelSetup();
    }
    if (this.extensionName !== "beads") {
      throw new UsageError(`Setup is not implemented for extension: ${this.extensionName}`);
    }

    return this.executeBeadsSetup();
  }

  private async executeBeadsSetup() {
    const bd = await findCommand("bd", process.env);
    if (!bd.available) {
      throw new UsageError(
        "bd command is not available. Install with: brew install beads OR npm install -g @beads/bd OR curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash",
      );
    }

    let targets;
    try {
      targets = normalizeBeadsTargets(this.target);
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : "Invalid Beads setup target.");
    }

    const plan = await planBeadsSetup({
      projectDir: this.context.cwd,
      targets,
      stealth: this.stealth,
      skipBdInit: this.skipBdInit,
        skipBdSetup: this.skipBdSetup,
      });
    const projectConfigPath = join(this.context.cwd, ".agents", "bgng", "config.json");
    const skillChange = this.includeSkill && !existsSync(projectConfigPath)
      ? `create ${projectConfigPath} and configure beads extension with beads-task-tracking`
      : this.includeSkill
        ? `configure beads extension with beads-task-tracking in ${projectConfigPath}`
        : `configure beads extension in ${projectConfigPath}`;
    const projectConfigChange = {
      extensionName: "beads",
      config: { enabled: true, targets, includeSkill: this.includeSkill },
      path: projectConfigPath,
    };

    if (this.dryRun) {
      const payload = { plan, projectConfigChange };
      if (this.json) {
        this.context.stdout.write(renderJson(payload));
      } else {
        const lines = [
          "Planned Beads setup:",
          ...plan.commands.map((command) => `- ${command.cmd.join(" ")} (${command.reason})`),
          ...(skillChange ? [`- ${skillChange}`] : []),
        ];
        this.context.stdout.write(`${lines.join("\n")}\n`);
      }
      return 0;
    }

    const results = await executeBeadsSetupPlan(plan, process.env);
    const failed = results.find((result) => result.exitCode !== 0);
    if (failed) {
      const payload = { plan, results };
      if (this.json) {
        this.context.stdout.write(renderJson(payload));
      }
      throw new UsageError(`Beads setup command failed: ${failed.cmd.join(" ")}`);
    }
    const configPath = ensureBeadsProjectExtensionConfig(this.context.cwd, {
      targets,
      includeSkill: this.includeSkill,
    });
    const payload = { plan, results, projectConfigPath: configPath };

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
    } else {
      const lines = [
        "Beads setup complete.",
        ...results.map((result) => `- ${result.cmd.join(" ")}: exit ${result.exitCode}`),
        ...(configPath ? [`- Updated ${configPath}`] : []),
      ];
      this.context.stdout.write(`${lines.join("\n")}\n`);
    }
    return 0;
  }

  private async executeParallelSetup() {
    const plan = planParallelSetup({
      projectDir: this.context.cwd,
      skills: !this.skipSkills,
      mcp: this.mcp,
    });

    if (this.dryRun) {
      if (this.json) {
        this.context.stdout.write(renderJson(plan));
      } else {
        this.context.stdout.write(
          [
            "Planned Parallel setup:",
            `- configure parallel extension in ${plan.projectConfigChange.path}`,
            `- skills: ${plan.projectConfigChange.config.skills ? "enabled" : "disabled"}`,
            `- mcp: ${plan.projectConfigChange.config.mcp ? "enabled" : "disabled"}`,
          ].join("\n") + "\n",
        );
      }
      return 0;
    }

    const configPath = ensureParallelProjectExtensionConfig({
      projectDir: this.context.cwd,
      skills: !this.skipSkills,
      mcp: this.mcp,
    });

    if (this.json) {
      this.context.stdout.write(renderJson({ ...plan, projectConfigPath: configPath }));
    } else {
      this.context.stdout.write(`Parallel extension configured in ${configPath}\n`);
    }
    return 0;
  }
}
